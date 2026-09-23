declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};
import { INVOICE_SCHEMA, normaliseInvoice, validateInvoiceFile } from './_shared/invoice.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const base = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const adminHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' };
interface ImportRow { id: string; event_id: string; document_id: string; status: string; provider_file_id: string | null; provider_job_id: string | null; extracted: unknown; warnings: string[]; expense_id: string | null; updated_at: string }
class SafeError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
async function db(path: string, headers: HeadersInit, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new SafeError('Could not save invoice progress. Please try again.', 503);
  return response.status === 204 ? null : response.json();
}
async function provider(path: string, key: string, method = 'GET', body?: FormData | object) {
  const response = await fetch(`https://api.mixedbread.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(40000),
  });
  if (!response.ok) throw new SafeError(response.status === 401 || response.status === 403 ? 'Mixedbread rejected the API key. Check Settings → API keys.' : response.status === 429 ? 'Mixedbread is busy or its allowance has been reached. Try again later.' : 'Mixedbread could not process this invoice. Try again later.', 502);
  return response.status === 204 ? null : response.json();
}
const publicResult = (row: ImportRow) => ({ ok: true, id: row.id, status: row.status, extracted: row.extracted, warnings: row.warnings, expense_id: row.expense_id });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST required.' }, 405);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) throw new SafeError('Sign in to import invoices.', 401);
    const userHeaders = { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' };
    const user = await fetch(`${base}/auth/v1/user`, { headers: userHeaders, signal: AbortSignal.timeout(10000) });
    if (!user.ok) throw new SafeError('Sign in to import invoices.', 401);
    const body = await req.json();
    if (!['start', 'poll'].includes(body.action)) throw new SafeError('Invalid invoice action.');
    const id = body.action === 'start' ? body.documentId : body.id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new SafeError('Invalid invoice identifier.');
    let row: ImportRow;
    // These reads use the caller's token and RLS, never the service role.
    const records = await db(body.action === 'start' ? `bm_documents?id=eq.${id}&select=*` : `bm_invoice_imports?id=eq.${id}&select=*`, userHeaders);
    if (!records.length) throw new SafeError('Invoice not accessible.', 403);
    let key = Deno.env.get('MIXEDBREAD_API_KEY');
    if (!key) key = await db('rpc/bm_ai_secret_get', adminHeaders, 'POST', { p_name: 'bm_ai_MIXEDBREAD_API_KEY' });
    if (!key) throw new SafeError('Add your Mixedbread API key in Settings → API keys to extract invoices.', 409);

    if (body.action === 'start') {
      const doc = records[0];
      validateInvoiceFile({ size: Number(doc.size_bytes), type: doc.mime_type });
      if (!doc.storage_path.startsWith(`${doc.event_id}/`)) throw new SafeError('Invoice document path is invalid.', 403);
      const download = await fetch(`${base}/storage/v1/object/authenticated/bm-documents/${doc.storage_path.split('/').map(encodeURIComponent).join('/')}`, { headers: userHeaders, signal: AbortSignal.timeout(30000) });
      if (!download.ok) throw new SafeError('Could not read the invoice document.', 502);
      const bytes = await download.arrayBuffer();
      validateInvoiceFile({ size: bytes.byteLength, type: doc.mime_type });
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      const existing = await db(`bm_invoice_imports?event_id=eq.${doc.event_id}&source_hash=eq.${hash}&select=*`, userHeaders);
      if (existing.length && existing[0].status !== 'failed') return json(publicResult(existing[0]));
      // Bound paid extraction usage per event. Polling and duplicate files do not consume it.
      const month = new Date().toISOString().slice(0, 7) + '-01';
      const recent = await db(`bm_invoice_imports?event_id=eq.${doc.event_id}&created_at=gte.${month}&select=id,attempts`, userHeaders);
      if (recent.reduce((sum: number, item: { attempts: number }) => sum + item.attempts, 0) >= 100) throw new SafeError('This event has reached its 100 invoice extraction attempts for this month.', 429);
      if (existing.length) {
        if (existing[0].attempts >= 3) throw new SafeError('Extraction failed three times. Check the key and document before asking support to reset it.');
        const claimed = await db(`bm_invoice_imports?id=eq.${existing[0].id}&status=eq.failed`, adminHeaders, 'PATCH', { status: 'starting', attempts: existing[0].attempts + 1 });
        if (!claimed.length) throw new SafeError('This invoice is already being processed. Reopen it from recent imports.', 409);
        row = claimed[0];
      } else {
        const response = await fetch(`${base}/rest/v1/bm_invoice_imports`, { method: 'POST', headers: { ...adminHeaders, Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ event_id: doc.event_id, document_id: doc.id, source_hash: hash }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new SafeError('Could not start the import. Please try again.', 503);
        const created = await response.json();
        if (!created.length) {
          const concurrent = await db(`bm_invoice_imports?event_id=eq.${doc.event_id}&source_hash=eq.${hash}`, userHeaders);
          return json(publicResult(concurrent[0]));
        }
        row = created[0];
      }
      try {
        const form = new FormData();
        form.set('file', new Blob([bytes], { type: doc.mime_type }), doc.name);
        const uploaded = await provider('files', key, 'POST', form);
        if (typeof uploaded?.id !== 'string') throw new SafeError('Mixedbread did not return a file identifier.', 502);
        row.provider_file_id = uploaded.id;
        await db(`bm_invoice_imports?id=eq.${row.id}`, adminHeaders, 'PATCH', { provider_file_id: uploaded.id });
        const job = await provider('extractions/jobs', key, 'POST', { file_id: uploaded.id, json_schema: INVOICE_SCHEMA });
        if (typeof job?.id !== 'string') throw new SafeError('Mixedbread did not return an extraction job.', 502);
        [row] = await db(`bm_invoice_imports?id=eq.${row.id}`, adminHeaders, 'PATCH', { provider_job_id: job.id, status: 'processing' });
      } catch (error) {
        await db(`bm_invoice_imports?id=eq.${row.id}`, adminHeaders, 'PATCH', { status: 'failed' });
        if (row.provider_file_id) await provider(`files/${encodeURIComponent(row.provider_file_id)}`, key, 'DELETE').catch(() => undefined);
        throw error;
      }
    } else {
      row = records[0];
      if (row.status === 'starting' && Date.now() - Date.parse(row.updated_at) > 120000) {
        [row] = await db(`bm_invoice_imports?id=eq.${row.id}&status=eq.starting`, adminHeaders, 'PATCH', { status: 'failed' });
      }
      if (row.status === 'processing' && row.provider_job_id) {
        const job = await provider(`extractions/jobs/${encodeURIComponent(row.provider_job_id)}`, key);
        if (job.status === 'completed') {
          const draft = normaliseInvoice(job.result?.data);
          const warnings = Array.isArray(job.result?.warnings) ? job.result.warnings.filter((v: unknown) => typeof v === 'string').slice(0, 30) : [];
          [row] = await db(`bm_invoice_imports?id=eq.${row.id}&status=eq.processing`, adminHeaders, 'PATCH', { status: 'review', extracted: draft, warnings });
        } else if (['failed', 'cancelled'].includes(job.status)) {
          [row] = await db(`bm_invoice_imports?id=eq.${row.id}&status=eq.processing`, adminHeaders, 'PATCH', { status: 'failed' });
        }
      }
    }
    if (row && ['review', 'saved', 'failed'].includes(row.status) && row.provider_file_id) {
      try {
        await provider(`files/${encodeURIComponent(row.provider_file_id)}`, key, 'DELETE');
        await db(`bm_invoice_imports?id=eq.${row.id}`, adminHeaders, 'PATCH', { provider_file_id: null });
      } catch { /* A later poll retries cleanup. The original stays in private planner storage. */ }
    }
    // Concurrent polling may have advanced the row before our conditional update.
    if (!row) [row] = await db(`bm_invoice_imports?id=eq.${id}`, userHeaders);
    return json(publicResult(row));
  } catch (error) {
    return json({ ok: false, message: error instanceof SafeError ? error.message : 'Invoice extraction could not finish. Your document is saved; reopen the import to try again.' }, error instanceof SafeError ? error.status : 500);
  }
});
