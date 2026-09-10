import { mergeTransactions, isLocalTransaction } from '../../utils/merge-transactions';
import type { Transaction } from '../../db/transactions';

function tx(over: Partial<Transaction> & { id: number; created_at: string }): Transaction {
  return {
    total: 100,
    cash_tendered: 100,
    change: 0,
    payment_method: 'cash',
    ref_number: null,
    proof_photo_uri: null,
    customer_handle: null,
    is_bundle: false,
    status: 'completed',
    remarks: null,
    client_uuid: null,
    items: [],
    ...over,
  };
}

describe('mergeTransactions', () => {
  it('drops a remote row that matches a local sale by client_uuid', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc' })];
    const remote = [tx({ id: 0, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc' })];
    const merged = mergeTransactions(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(1); // the local row survives
  });

  it('keeps a remote sale made on another device', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc' })];
    const remote = [
      tx({ id: 0, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc' }), // same as local
      tx({ id: 0, created_at: '2026-09-09T03:16:00.000Z', client_uuid: 'xyz', total: 340 }), // other device
    ];
    const merged = mergeTransactions(local, remote);
    expect(merged).toHaveLength(2);
    const remoteRow = merged.find((t) => t.client_uuid === 'xyz')!;
    expect(remoteRow.id).toBeLessThan(0); // remote-only rows get negative ids
    expect(isLocalTransaction(remoteRow)).toBe(false);
  });

  it('adopts a void done on another device onto the local row (monotonic)', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', status: 'completed' })];
    const remote = [tx({ id: 0, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', status: 'voided' })];
    const merged = mergeTransactions(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(1); // still the local row (rich fields kept)
    expect(merged[0].status).toBe('voided'); // Coop void reflected
  });

  it('never un-voids a locally voided sale when Coop still shows completed', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', status: 'voided' })];
    const remote = [tx({ id: 0, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', status: 'completed' })];
    const merged = mergeTransactions(local, remote);
    expect(merged[0].status).toBe('voided');
  });

  it('lets a Coop remark override the local one (cross-device edit)', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', remarks: 'local note' })];
    const remote = [tx({ id: 0, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', remarks: 'edited elsewhere' })];
    const merged = mergeTransactions(local, remote);
    expect(merged[0].remarks).toBe('edited elsewhere');
  });

  it('keeps the local remark when Coop has none', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', remarks: 'local only' })];
    const remote = [tx({ id: 0, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'abc', remarks: null })];
    const merged = mergeTransactions(local, remote);
    expect(merged[0].remarks).toBe('local only');
  });

  it('dedupes a legacy local row (null uuid) by same minute + total', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:45.000Z', total: 680, client_uuid: null })];
    const remote = [tx({ id: 0, created_at: '2026-09-09T02:30:12.000Z', total: 680, client_uuid: 'srv-1' })];
    const merged = mergeTransactions(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(1);
  });

  it('sorts the merged list newest first', () => {
    const local = [tx({ id: 1, created_at: '2026-09-09T02:30:00.000Z', client_uuid: 'a' })];
    const remote = [
      tx({ id: 0, created_at: '2026-09-09T05:00:00.000Z', client_uuid: 'b' }),
      tx({ id: 0, created_at: '2026-09-08T01:00:00.000Z', client_uuid: 'c' }),
    ];
    const merged = mergeTransactions(local, remote);
    expect(merged.map((t) => t.client_uuid)).toEqual(['b', 'a', 'c']);
  });

  it('assigns unique negative ids to remote-only rows', () => {
    const remote = [
      tx({ id: 0, created_at: '2026-09-09T05:00:00.000Z', client_uuid: 'b' }),
      tx({ id: 0, created_at: '2026-09-09T04:00:00.000Z', client_uuid: 'c' }),
    ];
    const merged = mergeTransactions([], remote);
    const ids = merged.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id < 0)).toBe(true);
  });
});
