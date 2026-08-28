import { useFetch } from '../../lib/useFetch';
import { supabase } from '../../lib/supabase';
import { useEventContext } from '../event/context';
import type { DocumentLinkEntityType, DocumentLinkWithDocument, DocumentRow } from './types';

/** Every document for the current event, newest first — `DocumentsPage` groups this by `folder`
 *  itself, and `DocumentPicker`'s "choose an existing document" list filters it client-side. */
export function useDocuments() {
  const { eventId } = useEventContext();
  return useFetch<DocumentRow[]>(async () => {
    const { data, error } = await supabase
      .from('bm_documents')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DocumentRow[];
  }, [eventId]);
}

/** The documents linked to one entity (a vendor, an expense, …), with each link's document
 *  embedded — what `VendorSheet`'s "linked documents" section renders. */
export function useDocumentLinks(entityType: DocumentLinkEntityType, entityId: string) {
  return useFetch<DocumentLinkWithDocument[]>(async () => {
    const { data, error } = await supabase
      .from('bm_document_links')
      .select('*, document:bm_documents(*)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as DocumentLinkWithDocument[];
  }, [entityType, entityId]);
}

/**
 * The distinct set of entity ids of one type that have AT LEAST one linked document — e.g. every
 * vendor id with a `bm_document_links` row. Built for
 * `lib/notifications/rules.ts`'s `vendorMissingDocumentNotifications`, which only needs
 * membership, not each link's own document — a single query across every entity of that type
 * rather than one `useDocumentLinks` call per row.
 */
export function useDocumentLinkEntityIds(entityType: DocumentLinkEntityType) {
  const { eventId } = useEventContext();
  return useFetch<string[]>(async () => {
    const { data, error } = await supabase
      .from('bm_document_links')
      .select('entity_id')
      .eq('event_id', eventId)
      .eq('entity_type', entityType);
    if (error) throw error;
    return Array.from(new Set((data ?? []).map((r) => r.entity_id as string)));
  }, [eventId, entityType]);
}
