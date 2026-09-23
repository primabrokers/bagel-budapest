import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let handler: (req: Request) => Promise<Response>;
const fetchMock = vi.fn();
const invoiceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const documentId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const baseRow = { id: invoiceId, event_id: 'event', document_id: documentId, status: 'processing', provider_job_id: 'job', provider_file_id: 'file', warnings: [], extracted: null, expense_id: null };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const request = (body: unknown, auth = true) => new Request('https://example.test', { method: 'POST', headers: { ...(auth ? { Authorization: 'Bearer user-token' } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (key: string) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', SUPABASE_ANON_KEY: 'test-anon-key', MIXEDBREAD_API_KEY: 'test-provider-key' })[key] } });
  vi.stubGlobal('fetch', fetchMock);
  await import('../../../supabase/functions/bm_invoice_extract/index');
});
beforeEach(() => fetchMock.mockReset());
afterAll(() => vi.unstubAllGlobals());

describe('invoice extraction endpoint', () => {
  it('rejects anonymous callers before any database or provider access', async () => {
    expect((await handler(request({ action: 'poll', id: invoiceId }, false))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('validates the user with Auth, not decoded token claims', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 401));
    expect((await handler(request({ action: 'poll', id: invoiceId }))).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('enforces caller RLS before a privileged write or provider call', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'user' })).mockResolvedValueOnce(reply([]));
    expect((await handler(request({ action: 'start', documentId }))).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer user-token');
  });
  it('returns reviewed details and removes the temporary provider file', async () => {
    const extracted = { vendor_name: 'Test', currency: 'GBP', total: 120 };
    fetchMock.mockResolvedValueOnce(reply({ id: 'user' })).mockResolvedValueOnce(reply([baseRow]))
      .mockResolvedValueOnce(reply({ status: 'completed', result: { data: extracted, warnings: [] } }))
      .mockResolvedValueOnce(reply([{ ...baseRow, status: 'review', extracted }]))
      .mockResolvedValueOnce(reply({ deleted: true })).mockResolvedValueOnce(reply([]));
    const response = await handler(request({ action: 'poll', id: invoiceId }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe('review'); expect(result.extracted.total).toBe(120);
    expect(result.provider_file_id).toBeUndefined();
    expect(fetchMock.mock.calls[4][0]).toBe('https://api.mixedbread.com/v1/files/file');
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
  });
  it('never exposes a raw provider error body', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'user' })).mockResolvedValueOnce(reply([baseRow]))
      .mockResolvedValueOnce(reply({ sensitive: 'private invoice contents' }, 429));
    const response = await handler(request({ action: 'poll', id: invoiceId }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private invoice');
  });
});
