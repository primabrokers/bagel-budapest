/**
 * Row types for `bm_documents` / `bm_document_links` — see migration 5
 * (`supabase/migrations/20260828030400_bm_vendors_budget_documents.sql`) for the applied schema
 * these mirror field-for-field. Hand-written, not generated — see CLAUDE.md's data-layer note.
 */

export interface DocumentRow {
  id: string;
  event_id: string;
  /** Null groups into the "Unfiled" bucket on `DocumentsPage`. */
  folder: string | null;
  name: string;
  /** Path within the PRIVATE `bm-documents` bucket — never a URL. Resolve to something
   *  downloadable on demand via `getSignedDocumentUrl`, never cached long-lived. */
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentLinkEntityType = 'vendor' | 'expense' | 'task' | 'idea' | 'function' | 'household' | 'menu_item';

export interface DocumentLinkRow {
  id: string;
  event_id: string;
  document_id: string;
  entity_type: DocumentLinkEntityType;
  entity_id: string;
  created_at: string;
}

/** A link with its document embedded — what `useDocumentLinks` returns, via a PostgREST
 *  embedded-resource select aliased to this friendlier field name (`document:bm_documents(*)`).
 *  This is what `VendorSheet`'s "linked documents" section renders directly. */
export interface DocumentLinkWithDocument extends DocumentLinkRow {
  document: DocumentRow;
}
