import {
  insertTransaction,
  voidTransaction,
  getAllTransactions,
  importTransaction,
  transactionExists,
  updateTransactionRemarks,
  markTransactionSynced,
  markVoidSynced,
  markRemarksSynced,
  getPendingSyncCount,
  getPendingSyncTransactions,
  deleteTransactionsByClientUuids,
} from '../../db/transactions';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('insertTransaction', () => {
  it('inserts transaction row then all item rows', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 10, changes: 1 }) // transaction
      .mockResolvedValue({ lastInsertRowId: 20, changes: 1 }); // items

    const items = [
      { productId: 1, productName: 'Cake', price: 120, quantity: 2 },
      { productId: 2, productName: 'Drink', price: 45, quantity: 1 },
    ];

    const id = await insertTransaction({
      total: 285,
      cashTendered: 300,
      change: 15,
      paymentMethod: 'cash',
      items,
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO transactions'),
      expect.arrayContaining([285, 300, 15, 'cash'])
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [10, 1, 'Cake', 120, 2, null, null]
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [10, 2, 'Drink', 45, 1, null, null]
    );
    expect(id).toBe(10);
  });

  it('passes variant fields when provided', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 10, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 20, changes: 1 });

    await insertTransaction({
      total: 45,
      cashTendered: 50,
      change: 5,
      paymentMethod: 'cash',
      items: [
        { productId: 1, productName: 'Milk Tea', price: 45, quantity: 1, variantId: 5, variantName: 'Wintermelon' },
      ],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('variant_id, variant_name'),
      [10, 1, 'Milk Tea', 45, 1, 5, 'Wintermelon']
    );
  });
});

describe('voidTransaction', () => {
  it('updates transaction status to voided', async () => {
    await voidTransaction(10);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "UPDATE transactions SET status = 'voided', void_synced_at = NULL WHERE id = ?",
      [10]
    );
  });
});

describe('getAllTransactions', () => {
  it('queries transactions joined with items ordered by created_at DESC', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getAllTransactions();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('FROM transactions t')
    );
  });

  it('groups transaction items under their parent transaction', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        t_id: 1, t_total: 285, t_cash: 300, t_change: 15,
        t_payment: 'cash', t_ref: null, t_proof: null,
        t_handle: null, t_bundle: 0,
        t_status: 'completed', t_created: '2026-04-19T10:00:00.000Z',
        ti_id: 1, transaction_id: 1, product_id: 1,
        product_name: 'Cake', price: 120, quantity: 2,
        variant_id: null, variant_name: null,
      },
      {
        t_id: 1, t_total: 285, t_cash: 300, t_change: 15,
        t_payment: 'cash', t_ref: null, t_proof: null,
        t_handle: null, t_bundle: 0,
        t_status: 'completed', t_created: '2026-04-19T10:00:00.000Z',
        ti_id: 2, transaction_id: 1, product_id: 2,
        product_name: 'Drink', price: 45, quantity: 1,
        variant_id: null, variant_name: null,
      },
    ]);

    const result = await getAllTransactions();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      total: 285,
      status: 'completed',
    });
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].product_name).toBe('Cake');
    expect(result[0].items[1].product_name).toBe('Drink');
  });
});

describe('importTransaction', () => {
  it('inserts with provided createdAt and status', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 99, changes: 1 });

    const id = await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'gcash',
      status: 'completed',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [{ productName: 'jerky treats', quantity: 1 }],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO transactions'),
      expect.arrayContaining([140, 140, 0, 'gcash', '2026-04-24T07:36:00.000Z', 'completed'])
    );
    expect(id).toBe(42);
  });

  it('inserts items with product_id=0 and price=0', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 99, changes: 1 });

    await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'gcash',
      status: 'completed',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [{ productName: 'jerky treats', quantity: 1 }],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [42, 0, 'jerky treats', 0, 1, null, null]
    );
  });

  it('inserts the provided price and variant_name when given', async () => {
    mockDb.runAsync
      .mockResolvedValueOnce({ lastInsertRowId: 42, changes: 1 })
      .mockResolvedValue({ lastInsertRowId: 99, changes: 1 });

    await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'gcash',
      status: 'completed',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [{ productName: 'jerky treats', quantity: 1, variantName: 'Chicken', price: 140 }],
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity, variant_id, variant_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [42, 0, 'jerky treats', 140, 1, null, 'Chicken']
    );
  });

  it('stores voided status correctly', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });

    await importTransaction({
      total: 140,
      cashTendered: 140,
      change: 0,
      paymentMethod: 'cash',
      status: 'voided',
      createdAt: '2026-04-24T07:36:00.000Z',
      items: [],
    });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO transactions'),
      expect.arrayContaining(['voided'])
    );
  });
});

describe('transactionExists', () => {
  it('returns true when a matching transaction exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 5 });
    const exists = await transactionExists('2026-04-24T07:36', 140);
    expect(exists).toBe(true);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('substr(created_at, 1, 16)'),
      [140, '2026-04-24T07:36']
    );
  });

  it('returns false when no matching transaction exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const exists = await transactionExists('2026-04-24T07:36', 140);
    expect(exists).toBe(false);
  });
});

describe('markTransactionSynced', () => {
  it('sets synced_at by client_uuid', async () => {
    await markTransactionSynced('abc-123');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE transactions SET synced_at = ? WHERE client_uuid = ?',
      [expect.any(String), 'abc-123']
    );
  });
});

describe('updateTransactionRemarks', () => {
  it('sets the note and nulls remarks_synced_at so the outbox re-pushes it', async () => {
    await updateTransactionRemarks(7, 'call customer');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE transactions SET remarks = ?, remarks_synced_at = NULL WHERE id = ?',
      ['call customer', 7]
    );
  });
});

describe('markVoidSynced / markRemarksSynced', () => {
  it('sets void_synced_at by client_uuid', async () => {
    await markVoidSynced('abc');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE transactions SET void_synced_at = ? WHERE client_uuid = ?',
      [expect.any(String), 'abc']
    );
  });

  it('sets remarks_synced_at by client_uuid', async () => {
    await markRemarksSynced('abc');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE transactions SET remarks_synced_at = ? WHERE client_uuid = ?',
      [expect.any(String), 'abc']
    );
  });
});

describe('getPendingSyncCount', () => {
  it('counts rows with any unsynced sale/void/remarks, excluding no-uuid rows', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ n: 3 });
    const n = await getPendingSyncCount();
    expect(n).toBe(3);
    const [sql] = mockDb.getFirstAsync.mock.calls[0];
    expect(sql).toContain('client_uuid IS NOT NULL');
    expect(sql).toContain('synced_at IS NULL');
    expect(sql).toContain("status = 'voided' AND t.void_synced_at IS NULL");
    expect(sql).toContain('remarks_synced_at IS NULL');
  });

  it('returns 0 when the count query yields nothing', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await getPendingSyncCount()).toBe(0);
  });
});

describe('getPendingSyncTransactions', () => {
  it('only returns settled rows (a created_at recency floor) so an in-flight sale is never read mid-write', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getPendingSyncTransactions();
    const [sql, params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain('t.created_at <= ?');
    expect(sql).toContain('ORDER BY t.created_at ASC');
    // A single ISO cutoff bound, in the recent past.
    expect(params).toHaveLength(1);
    expect(Date.parse(params![0])).toBeLessThanOrEqual(Date.now());
  });
});

describe('deleteTransactionsByClientUuids', () => {
  it('deletes items then the transaction rows for the given client_uuids', async () => {
    await deleteTransactionsByClientUuids(['a', 'b']);
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE client_uuid IN (?,?))',
      ['a', 'b']
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM transactions WHERE client_uuid IN (?,?)',
      ['a', 'b']
    );
  });

  it('does nothing for an empty list', async () => {
    await deleteTransactionsByClientUuids([]);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('chunks a large list so it never blows the SQLite bound-parameter limit', async () => {
    const uuids = Array.from({ length: 450 }, (_, i) => `u${i}`);
    await deleteTransactionsByClientUuids(uuids);
    // 450 uuids -> 3 chunks (200 + 200 + 50) -> 2 deletes each = 6 runAsync calls.
    expect(mockDb.runAsync).toHaveBeenCalledTimes(6);
    // No single call binds more than 200 params.
    for (const call of mockDb.runAsync.mock.calls) {
      expect((call[1] as unknown[]).length).toBeLessThanOrEqual(200);
    }
  });
});
