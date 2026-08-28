import { supabase } from '../../lib/supabase';
import { logActivity } from '../activity/log';
import type { DocumentLinkEntityType, DocumentLinkRow, DocumentRow } from './types';

/**
 * Uploads `file` to the PRIVATE `bm-documents` bucket at `${eventId}/${randomId}-${filename}` —
 * the RLS policy on `storage.objects` requires the first path segment to be an event id this
 * account is a member of (see migration 5's storage policies) — then inserts the `bm_documents`
 * row pointing at it. Because the bucket is private, rendering or downloading it later needs a
 * signed URL (`getSignedDocumentUrl`), not a public one.
 */
export async function uploadDocument(eventId: string, file: File, folder?: string | null): Promise<DocumentRow> {
  const path = `${eventId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('bm-documents').upload(path, file);
  if (uploadError) throw uploadError;

  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('bm_documents')
    .insert({
      event_id: eventId,
      folder: folder ?? null,
      name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userData.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as DocumentRow;
  await logActivity({
    eventId,
    action: 'document_uploaded',
    entityType: 'document',
    entityId: row.id,
    summary: `Uploaded ${row.name}`,
    after: row,
  });
  return row;
}

/** Confirm with the user before calling this — it does not ask itself. Deletes the storage
 *  object first, then the row; if the storage delete fails the row is left in place rather than
 *  pointing at nothing. */
export async function deleteDocument(id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('bm_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return;
  const row = existing as DocumentRow;

  const { error: storageError } = await supabase.storage.from('bm-documents').remove([row.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase.from('bm_documents').delete().eq('id', id);
  if (error) throw error;

  await logActivity({
    eventId: row.event_id,
    action: 'document_deleted',
    entityType: 'document',
    entityId: id,
    summary: `Removed ${row.name}`,
    before: row,
  });
}

/**
 * Attaches an existing document to an entity (a vendor, an expense, …). Not logged — per
 * CLAUDE.md's "meaningful changes" line, the upload/removal of the document ITSELF is what the
 * activity feed records; attaching it to one more place it's relevant is bookkeeping, the same
 * distinction `updateQuote` in `data/vendors/mutations.ts` draws for a quote's own field edits.
 */
export async function linkDocument(
  documentId: string,
  entityType: DocumentLinkEntityType,
  entityId: string,
): Promise<DocumentLinkRow> {
  // `bm_document_links.event_id` is NOT NULL, but this table is reached from an entity that may
  // not itself carry an event_id column (or under a different name) — reading it off the
  // document being linked is simpler than teaching this function every entity table's shape.
  const { data: doc, error: docError } = await supabase
    .from('bm_documents')
    .select('event_id')
    .eq('id', documentId)
    .single();
  if (docError) throw docError;

  const { data, error } = await supabase
    .from('bm_document_links')
    .insert({
      event_id: (doc as { event_id: string }).event_id,
      document_id: documentId,
      entity_type: entityType,
      entity_id: entityId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DocumentLinkRow;
}

/** Confirm with the user before calling this — it does not ask itself. Not logged; see
 *  `linkDocument`'s comment on why attaching/detaching stays out of the activity feed. */
export async function unlinkDocument(linkId: string): Promise<void> {
  const { error } = await supabase.from('bm_document_links').delete().eq('id', linkId);
  if (error) throw error;
}

/**
 * A short-lived signed URL for previewing or downloading a document from the private
 * `bm-documents` bucket. Generate this on demand when a preview/download is actually requested —
 * never pre-generate and cache one, since it expires and a stale cached link would silently fail.
 */
export async function getSignedDocumentUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from('bm-documents').createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
