import {
  insertTransaction,
  voidTransaction,
  getAllTransactions,
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
      'INSERT INTO transactions (total, cash_tendered, change, payment_method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [285, 300, 15, 'cash', 'completed', expect.any(String)]
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [10, 1, 'Cake', 120, 2]
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [10, 2, 'Drink', 45, 1]
    );
    expect(id).toBe(10);
  });
});

describe('voidTransaction', () => {
  it('updates transaction status to voided', async () => {
    await voidTransaction(10);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "UPDATE transactions SET status = 'voided' WHERE id = ?",
      [10]
    );
  });
});

describe('getAllTransactions', () => {
  it('queries transactions joined with items ordered by created_at DESC', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getAllTransactions();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('FROM transactions t'),
      undefined
    );
  });

  it('groups transaction items under their parent transaction', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        t_id: 1, t_total: 285, t_cash: 300, t_change: 15,
        t_status: 'completed', t_created: '2026-04-19T10:00:00.000Z',
        ti_id: 1, transaction_id: 1, product_id: 1,
        product_name: 'Cake', price: 120, quantity: 2,
      },
      {
        t_id: 1, t_total: 285, t_cash: 300, t_change: 15,
        t_status: 'completed', t_created: '2026-04-19T10:00:00.000Z',
        ti_id: 2, transaction_id: 1, product_id: 2,
        product_name: 'Drink', price: 45, quantity: 1,
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
