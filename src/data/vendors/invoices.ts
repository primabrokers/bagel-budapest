import { supabase } from '../../lib/supabase';
import { useFetch } from '../../lib/useFetch';
import { useEventContext } from '../event/context';
import type { InvoiceDraft } from '../../../supabase/functions/bm_invoice_extract/_shared/invoice';

export interface InvoiceImport {
  id: string; document_id: string; status: 'starting' | 'processing' | 'review' | 'saved' | 'failed';
  extracted: InvoiceDraft | null; reviewed: InvoiceDraft | null; warnings: string[];
  vendor_id: string | null; expense_id: string | null; invoice_number: string | null; created_at: string;
  document: { name: string; storage_path: string };
}
export function useInvoiceImports() {
  const { eventId } = useEventContext();
  return useFetch<InvoiceImport[]>(async () => {
    const { data, error } = await supabase.from('bm_invoice_imports')
      .select('id, document_id, status, extracted, reviewed, warnings, vendor_id, expense_id, invoice_number, created_at, document:bm_documents(name,storage_path)')
      .eq('event_id', eventId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data as unknown as InvoiceImport[];
  }, [eventId]);
}
export async function extractInvoice(body: { action: 'start'; documentId: string } | { action: 'poll'; id: string }): Promise<Pick<InvoiceImport, 'id' | 'status' | 'extracted' | 'warnings' | 'expense_id'>> {
  const { data, error } = await supabase.functions.invoke('bm_invoice_extract', { body });
  if (error) {
    let message = 'Could not extract invoice. Reopen this import to retry.';
    try {
      const response = await error.context?.json();
      if (typeof response?.message === 'string') message = response.message;
    } catch { /* Network failures have no JSON response. */ }
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.message || 'Could not extract invoice.');
  return data;
}
export async function saveInvoice(id: string, draft: InvoiceDraft, category: string, vendorId: string, expenseId: string): Promise<{ vendor_id: string; expense_id: string }> {
  const { data, error } = await supabase.rpc('bm_save_invoice', { p_import_id: id, p_draft: draft, p_category: category, p_vendor_id: vendorId || null, p_expense_id: expenseId || null });
  if (error) throw new Error(error.message);
  return data;
}
