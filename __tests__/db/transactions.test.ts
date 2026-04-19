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
      items,
    });

    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO transactions (total, cash_tendered, change, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [285, 300, 15, 'completed', expect.any(String)]
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
      expect.stringContaining('SELECT t.*, ti.product_name'),
      undefined
    );
  });
});
