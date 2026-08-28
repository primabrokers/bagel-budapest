import { useMemo, useState } from 'react';
import { CheckSquare, LayoutGrid, List as ListIcon, Plus, CalendarClock } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { useTasks } from '../data/tasks/hooks';
import { setTaskStatus } from '../data/tasks/mutations';
import { useFamilyMembers } from '../data/event/hooks';
import { formatMonthYear } from '../lib/format';
import { TaskCard } from '../components/tasks/TaskCard';
import { TaskSheet } from '../components/tasks/TaskSheet';
import { GenerateMilestonesButton } from '../components/tasks/GenerateMilestonesButton';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../components/tasks/taskMeta';
import type { TaskRow } from '../data/tasks/types';

type ViewMode = 'list' | 'kanban' | 'calendar';

const VIEW_TABS: TabItem<ViewMode>[] = [
  { key: 'list', label: 'List', icon: ListIcon },
  { key: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { key: 'calendar', label: 'Calendar', icon: CalendarClock },
];

const NO_DUE_DATE_KEY = '__no_due_date__';

/** Groups tasks by the calendar month of `due_date`, earliest month first; tasks with no due
 *  date form their own trailing group rather than being dropped or mixed into "this month". */
function groupByMonth(tasks: TaskRow[]): { key: string; label: string; tasks: TaskRow[] }[] {
  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const key = task.due_date ? task.due_date.slice(0, 7) : NO_DUE_DATE_KEY;
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === NO_DUE_DATE_KEY) return 1;
      if (b === NO_DUE_DATE_KEY) return -1;
      return a.localeCompare(b);
    })
    .map(([key, groupTasks]) => ({
      key,
      label: key === NO_DUE_DATE_KEY ? 'No due date' : formatMonthYear(groupTasks[0].due_date),
      tasks: groupTasks,
    }));
}

export function TasksPage() {
  const { data: tasks, loading, reload } = useTasks();
  const { data: members } = useFamilyMembers();
  const [view, setView] = useState<ViewMode>('list');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const ownerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) map.set(m.id, m.display_name || m.invited_email || 'Family member');
    return map;
  }, [members]);

  const openTask = openTaskId ? (tasks ?? []).find((t) => t.id === openTaskId) ?? null : null;

  function openEdit(task: TaskRow) {
    setOpenTaskId(task.id);
    setSheetMode('edit');
  }

  function openAdd() {
    setOpenTaskId(null);
    setSheetMode('add');
  }

  function closeSheet() {
    setSheetMode('closed');
    setOpenTaskId(null);
  }

  async function handleToggleDone(task: TaskRow) {
    setToggleBusyId(task.id);
    try {
      await setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done');
      reload();
    } catch {
      showToast('Could not update that task — please try again.', 'error');
    } finally {
      setToggleBusyId(null);
    }
  }

  const monthGroups = useMemo(() => groupByMonth(tasks ?? []), [tasks]);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        title="Tasks"
        subtitle="Everything on the planning list, from booking the venue to the final balance."
        actions={
          <>
            <GenerateMilestonesButton onGenerated={reload} />
            <Button type="button" onClick={openAdd}>
              <Plus size={15} aria-hidden="true" />
              Add task
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <Tabs items={VIEW_TABS} value={view} onChange={setView} ariaLabel="Task view" variant="segmented" />
      </div>

      {loading && !tasks ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (tasks ?? []).length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          hint="Add your first task, or generate the standard planning milestones to get started."
          action={
            <>
              <GenerateMilestonesButton onGenerated={reload} />
              <Button type="button" size="sm" onClick={openAdd}>
                <Plus size={14} aria-hidden="true" />
                Add task
              </Button>
            </>
          }
        />
      ) : view === 'list' ? (
        <div className="flex flex-col gap-2">
          {(tasks ?? []).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              ownerName={task.owner_member_id ? ownerNameById.get(task.owner_member_id) : null}
              onOpen={() => openEdit(task)}
              onToggleDone={() => void handleToggleDone(task)}
              toggleBusy={toggleBusyId === task.id}
            />
          ))}
        </div>
      ) : view === 'kanban' ? (
        <>
          {/* Real side-by-side columns from `sm` up, their own contained horizontal scroll.
              Below `sm` this falls back to a status-grouped list — the same phone rule
              `VendorsPage`'s board uses. */}
          <div className="hidden gap-3 overflow-x-auto pb-2 sm:flex">
            {TASK_STATUSES.map((status) => {
              const columnTasks = (tasks ?? []).filter((t) => t.status === status);
              return (
                <div key={status} className="flex w-64 shrink-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h2 className="text-xs font-semibold uppercase tracking-[.04em] text-text-muted">
                      {TASK_STATUS_LABELS[status]}
                    </h2>
                    <span className="text-2xs tabular-nums text-text-faint">{columnTasks.length}</span>
                  </div>
                  {columnTasks.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-separator px-3 py-4 text-center text-2xs text-text-faint">
                      None
                    </p>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        ownerName={task.owner_member_id ? ownerNameById.get(task.owner_member_id) : null}
                        onOpen={() => openEdit(task)}
                        onToggleDone={() => void handleToggleDone(task)}
                        toggleBusy={toggleBusyId === task.id}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-5 sm:hidden">
            {TASK_STATUSES.map((status) => {
              const columnTasks = (tasks ?? []).filter((t) => t.status === status);
              if (columnTasks.length === 0) return null;
              return (
                <div key={status} className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[.04em] text-text-muted">
                    {TASK_STATUS_LABELS[status]} · {columnTasks.length}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        ownerName={task.owner_member_id ? ownerNameById.get(task.owner_member_id) : null}
                        onOpen={() => openEdit(task)}
                        onToggleDone={() => void handleToggleDone(task)}
                        toggleBusy={toggleBusyId === task.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-5">
          {monthGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[.04em] text-text-muted">{group.label}</h2>
              <div className="flex flex-col gap-2">
                {group.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    ownerName={task.owner_member_id ? ownerNameById.get(task.owner_member_id) : null}
                    onOpen={() => openEdit(task)}
                    onToggleDone={() => void handleToggleDone(task)}
                    toggleBusy={toggleBusyId === task.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskSheet open={sheetMode !== 'closed'} onClose={closeSheet} task={sheetMode === 'edit' ? openTask : null} onSaved={reload} />
    </div>
  );
}
