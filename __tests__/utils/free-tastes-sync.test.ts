import { voidFreeTaste } from '../../utils/free-tastes-sync';
import * as supa from '../../lib/supabase';
import * as syncStatus from '../../utils/sync-status';

// Only the Coop client and the "last synced" marker matter for voidFreeTaste; the
// DB reads it imports are never touched on this path.
jest.mock('../../lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('../../utils/sync-status', () => ({ markSynced: jest.fn().mockResolvedValue(undefined) }));

const mockedGetSupabase = supa.getSupabase as jest.Mock;

// Point getSupabase at a client whose rpc resolves to `result`, returning the rpc
// mock so a test can assert how it was called.
function sbReturning(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  mockedGetSupabase.mockReturnValue({ rpc });
  return rpc;
}

describe('voidFreeTaste', () => {
  beforeEach(() => jest.clearAllMocks());

  // This is the no-double-restore contract: when Coop reports the row was already
  // voided, the caller must see idempotent:true so it skips the local restock.
  it('surfaces idempotent:true when Coop reports the row was already voided', async () => {
    const rpc = sbReturning({ data: { ok: true, id: 'x', idempotent: true }, error: null });
    const res = await voidFreeTaste('uuid-1');
    expect(res).toEqual({ ok: true, idempotent: true });
    expect(rpc).toHaveBeenCalledWith('void_free_taste', { p_client_uuid: 'uuid-1' });
    expect(syncStatus.markSynced).toHaveBeenCalledTimes(1);
  });

  it('reports idempotent:false on a genuine first-time reversal', async () => {
    sbReturning({ data: { ok: true, id: 'x', idempotent: false }, error: null });
    const res = await voidFreeTaste('uuid-2');
    expect(res).toEqual({ ok: true, idempotent: false });
  });

  it('treats a missing idempotent flag as a genuine reversal (false)', async () => {
    sbReturning({ data: { ok: true }, error: null });
    const res = await voidFreeTaste('uuid-3');
    expect(res).toEqual({ ok: true, idempotent: false });
  });

  it('returns ok:false with the error message when the RPC errors', async () => {
    sbReturning({ data: null, error: { message: 'boom' } });
    const res = await voidFreeTaste('uuid-4');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
    expect(syncStatus.markSynced).not.toHaveBeenCalled();
  });

  it('returns ok:false when the RPC payload itself rejects (ok:false)', async () => {
    sbReturning({ data: { ok: false, error: 'not found' }, error: null });
    const res = await voidFreeTaste('uuid-5');
    expect(res).toEqual({ ok: false, error: 'not found' });
    expect(syncStatus.markSynced).not.toHaveBeenCalled();
  });

  it('returns ok:false when Supabase is unconfigured (offline)', async () => {
    mockedGetSupabase.mockReturnValue(null);
    const res = await voidFreeTaste('uuid-6');
    expect(res.ok).toBe(false);
    expect(res.idempotent).toBeUndefined();
  });
});
