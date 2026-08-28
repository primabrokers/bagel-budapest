/**
 * Row types for `bm_idea_boards` / `bm_ideas` — see migration 6
 * (`supabase/migrations/20260828030500_bm_planning_modules.sql`) for the applied schema these
 * mirror field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export type IdeaStatus = 'inspiration' | 'considering' | 'shortlisted' | 'approved' | 'purchased' | 'rejected';

export interface IdeaBoardRow {
  id: string;
  event_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface IdeaRow {
  id: string;
  event_id: string;
  board_id: string;
  title: string;
  description: string | null;
  /** Path within the PRIVATE `bm-idea-images` bucket — never a URL. Resolve to something
   *  renderable on demand via `getSignedIdeaImageUrl`, never cached long-lived. */
  image_path: string | null;
  source_url: string | null;
  cost_estimate: number | null;
  vendor_id: string | null;
  status: IdeaStatus;
  tags: string[];
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** One board with its ideas embedded — the shape `useIdeaBoards()` returns, via a PostgREST
 *  embedded-resource select (`*, bm_ideas(*)`). */
export interface BoardWithIdeas extends IdeaBoardRow {
  ideas: IdeaRow[];
}
