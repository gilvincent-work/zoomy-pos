import { drainOutbox, saleForPushFromTransaction, refreshPendingCount } from '../../utils/outbox';
import type { Transaction } from '../../db/transactions';
import * as txs from '../../db/transactions';
import * as salesSync from '../../utils/sales-sync';
import * as ordersRemote from '../../utils/orders-remote';
import * as syncStatus from '../../utils/sync-status';

jest.mock('../../db/transactions', () => ({
  getPendingSyncTransactions: jest.fn(),
  getPendingSyncCount: jest.fn().mockResolvedValue(0),
  markTransactionSynced: jest.fn().mockResolvedValue(undefined),
  markVoidSynced: jest.fn().mockResolvedValue(undefined),
  markRemarksSynced: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/sales-sync', () => ({ pushSale: jest.fn() }));
jest.mock('../../utils/orders-remote', () => ({
  voidRemoteOrder: jest.fn(),
  setRemoteOrderRemarks: jest.fn(),
}));
jest.mock('../../utils/sync-status', () => ({
  beginSync: jest.fn(),
  endSync: jest.fn(),
  setPendingCount: jest.fn(),
}));

const mockTxs = txs as jest.Mocked<typeof txs>;
const mockPush = salesSync.pushSale as jest.Mock;
const mockVoid = ordersRemote.voidRemoteOrder as jest.Mock;
const mockRemarks = ordersRemote.setRemoteOrderRemarks as jest.Mock;

function tx(over: Partial<Transaction> & { id: number; client_uuid: string }): Transaction {
  return {
    total: 300,
    cash_tendered: 300,
    change: 0,
    payment_method: 'cash',
    ref_number: null,
    proof_photo_uri: null,
    customer_handle: null,
    is_bundle: false,
    status: 'completed',
    created_at: '2026-09-10T07:40:00.000Z',
    remarks: null,
    synced_at: null,
    void_synced_at: null,
    remarks_synced_at: '2026-09-10T07:40:00.000Z',
    items: [
      { id: 1, transaction_id: over.id, product_id: 5, product_name: 'Duck Pear', price: 300, quantity: 1, variant_id: null, variant_name: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTxs.getPendingSyncCount.mockResolvedValue(0);
});

describe('saleForPushFromTransaction', () => {
  it('preserves client_uuid + original created_at + customer handle and maps items', () => {
    const t = tx({ id: 1, client_uuid: 'u1', total: 600, created_at: '2026-09-10T07:00:00.000Z', customer_handle: '@testpup' });
    const p = saleForPushFromTransaction(t);
    expect(p.clientUuid).toBe('u1');
    expect(p.createdAt).toBe('2026-09-10T07:00:00.000Z'); // sale time, not retry time
    expect(p.customerHandle).toBe('@testpup'); // carried on the retry
    expect(p.subtotal).toBe(600);
    expect(p.total).toBe(600);
    expect(p.discount).toBeNull();
    expect(p.items).toEqual([
      { productId: 5, productName: 'Duck Pear', price: 300, quantity: 1, variantId: undefined, variantName: undefined },
    ]);
  });
});

describe('drainOutbox', () => {
  it('is a no-op (no beginSync) when nothing is pending', async () => {
    mockTxs.getPendingSyncTransactions.mockResolvedValue([]);
    const res = await drainOutbox();
    expect(res).toEqual({ pushed: 0, failed: 0 });
    expect(syncStatus.beginSync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(syncStatus.setPendingCount).toHaveBeenCalled(); // still refreshes the marker
  });

  it('pushes an unsynced sale and marks it synced', async () => {
    mockTxs.getPendingSyncTransactions.mockResolvedValue([tx({ id: 1, client_uuid: 'u1' })]);
    mockPush.mockResolvedValue({ ok: true });
    const res = await drainOutbox();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0].clientUuid).toBe('u1');
    expect(mockTxs.markTransactionSynced).toHaveBeenCalledWith('u1');
    expect(res).toEqual({ pushed: 1, failed: 0 });
  });

  it('does NOT void or annotate a sale whose push fails (Coop lacks it)', async () => {
    mockTxs.getPendingSyncTransactions.mockResolvedValue([
      tx({ id: 1, client_uuid: 'u1', status: 'voided', void_synced_at: null, remarks: 'note', remarks_synced_at: null }),
    ]);
    mockPush.mockResolvedValue({ ok: false, error: 'offline' });
    const res = await drainOutbox();
    expect(mockTxs.markTransactionSynced).not.toHaveBeenCalled();
    expect(mockVoid).not.toHaveBeenCalled();
    expect(mockRemarks).not.toHaveBeenCalled();
    expect(res).toEqual({ pushed: 0, failed: 1 });
  });

  it('pushes a void for an already-synced voided sale (no sale re-push)', async () => {
    mockTxs.getPendingSyncTransactions.mockResolvedValue([
      tx({ id: 1, client_uuid: 'u1', synced_at: '2026-09-10T07:41:00.000Z', status: 'voided', void_synced_at: null }),
    ]);
    mockVoid.mockResolvedValue(true);
    await drainOutbox();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockVoid).toHaveBeenCalledWith('u1');
    expect(mockTxs.markVoidSynced).toHaveBeenCalledWith('u1');
  });

  it('pushes sale, then void, then remarks in one pass for a fully-dirty row', async () => {
    mockTxs.getPendingSyncTransactions.mockResolvedValue([
      tx({ id: 1, client_uuid: 'u1', synced_at: null, status: 'voided', void_synced_at: null, remarks: 'note', remarks_synced_at: null }),
    ]);
    mockPush.mockResolvedValue({ ok: true });
    mockVoid.mockResolvedValue(true);
    mockRemarks.mockResolvedValue(true);
    await drainOutbox();
    expect(mockTxs.markTransactionSynced).toHaveBeenCalledWith('u1');
    expect(mockVoid).toHaveBeenCalledWith('u1');
    expect(mockTxs.markVoidSynced).toHaveBeenCalledWith('u1');
    expect(mockRemarks).toHaveBeenCalledWith('u1', 'note');
    expect(mockTxs.markRemarksSynced).toHaveBeenCalledWith('u1');
  });

  it('does not mark a void/remarks synced when its Coop write fails', async () => {
    mockTxs.getPendingSyncTransactions.mockResolvedValue([
      tx({ id: 1, client_uuid: 'u1', synced_at: '2026-09-10T07:41:00.000Z', status: 'voided', void_synced_at: null, remarks: 'note', remarks_synced_at: null }),
    ]);
    mockVoid.mockResolvedValue(false);
    mockRemarks.mockResolvedValue(false);
    await drainOutbox();
    expect(mockTxs.markVoidSynced).not.toHaveBeenCalled();
    expect(mockTxs.markRemarksSynced).not.toHaveBeenCalled();
  });

  it('single-flight: a second drain while one is in progress returns immediately', async () => {
    let resolvePush: (v: { ok: boolean }) => void = () => {};
    mockTxs.getPendingSyncTransactions.mockResolvedValue([tx({ id: 1, client_uuid: 'u1' })]);
    mockPush.mockReturnValue(new Promise((r) => { resolvePush = r; }));

    const first = drainOutbox();
    await Promise.resolve(); // let the first drain reach the awaited push
    const second = await drainOutbox();
    expect(second).toEqual({ pushed: 0, failed: 0 });
    expect(mockPush).toHaveBeenCalledTimes(1); // second didn't start its own push

    resolvePush({ ok: true });
    await first;
  });
});

describe('refreshPendingCount', () => {
  it('pushes the db count into the sync-status store', async () => {
    mockTxs.getPendingSyncCount.mockResolvedValue(4);
    await refreshPendingCount();
    expect(syncStatus.setPendingCount).toHaveBeenCalledWith(4);
  });
});
