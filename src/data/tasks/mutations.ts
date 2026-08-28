import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import { computeMilestoneDueDates, toDateOnlyString } from '../../lib/tasks/milestones';
import type { TaskPriority, TaskRow, TaskStatus } from './types';

export interface TaskInput {
  title: string;
  category?: string | null;
  owner_member_id?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  vendor_id?: string | null;
  guest_id?: string | null;
  notes?: string | null;
}

export async function createTask(eventId: string, input: TaskInput): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('bm_tasks')
    .insert({ event_id: eventId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as TaskRow;
  await logActivity({
    eventId,
    action: 'task_created',
    entityType: 'task',
    entityId: row.id,
    summary: `Added task: ${row.title}`,
    after: row,
  });
  return row;
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<TaskRow> {
  const { data, error } = await supabase.from('bm_tasks').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  const row = data as TaskRow;
  await logActivity({
    eventId: row.event_id,
    action: 'task_updated',
    entityType: 'task',
    entityId: row.id,
    summary: `Updated task: ${row.title}`,
    after: patch,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. */
export async function deleteTask(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from('bm_tasks').select('*').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('bm_tasks').delete().eq('id', id);
  if (error) throw error;

  if (existing) {
    const row = existing as TaskRow;
    await logActivity({
      eventId: row.event_id,
      action: 'task_deleted',
      entityType: 'task',
      entityId: id,
      summary: `Removed task: ${row.title}`,
      before: row,
    });
  }
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'to do',
  in_progress: 'in progress',
  waiting: 'waiting',
  done: 'done',
  cancelled: 'cancelled',
};

/**
 * Moves a task to `status`, setting `completed_at` to now when that status is `done` and
 * clearing it for every other status — so a task bounced back off `done` (a family reopening
 * something they marked complete too soon) does not keep a stale completion timestamp.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { data, error } = await supabase
    .from('bm_tasks')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const row = data as TaskRow;
  await logActivity({
    eventId: row.event_id,
    action: 'task_status_changed',
    entityType: 'task',
    entityId: row.id,
    summary: `Marked "${row.title}" as ${STATUS_LABELS[status]}`,
    after: { status },
  });
}

export interface GenerateMilestoneTasksResult {
  /** Milestones that did not already exist as a task and were just created. */
  created: number;
  /** Milestones skipped because a task with that exact title already existed for this event. */
  skipped: number;
}

/**
 * Turns `computeMilestoneDueDates` into real `bm_tasks` rows, one per standard milestone —
 * idempotent by title: a milestone whose exact title already exists as a task for this event is
 * left untouched (never duplicated, never overwritten — a family may have already edited its due
 * date or status), so running this twice in a row creates nothing the second time.
 */
export async function generateMilestoneTasks(eventId: string, eventDate: Date): Promise<GenerateMilestoneTasksResult> {
  const milestones = computeMilestoneDueDates(eventDate);

  const { data: existing, error: fetchError } = await supabase.from('bm_tasks').select('title').eq('event_id', eventId);
  if (fetchError) throw fetchError;
  const existingTitles = new Set((existing ?? []).map((t) => t.title as string));

  const toCreate = milestones.filter((m) => !existingTitles.has(m.title));
  const skipped = milestones.length - toCreate.length;

  if (toCreate.length === 0) return { created: 0, skipped };

  const rows = toCreate.map((m) => ({
    event_id: eventId,
    title: m.title,
    category: 'Milestone',
    due_date: toDateOnlyString(m.dueDate),
    priority: 'medium' as TaskPriority,
    status: 'todo' as TaskStatus,
  }));

  const { error: insertError } = await supabase.from('bm_tasks').insert(rows);
  if (insertError) throw insertError;

  await logActivity({
    eventId,
    action: 'milestone_tasks_generated',
    entityType: 'task',
    summary: `Generated ${toCreate.length} milestone task${toCreate.length === 1 ? '' : 's'}`,
    after: { titles: toCreate.map((m) => m.title) },
  });

  return { created: toCreate.length, skipped };
}
