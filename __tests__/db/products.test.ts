import {
  getActiveProducts,
  getAllProducts,
  createProduct,
  updateProduct,
} from '../../db/products';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

const mockProduct = {
  id: 1,
  name: 'Cake',
  price: 120,
  emoji: '🍰',
  is_active: 1,
  created_at: '2026-04-19T10:00:00.000Z',
};

describe('getActiveProducts', () => {
  it('queries only active products ordered by name', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([mockProduct]);
    const result = await getActiveProducts();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC'
    );
    expect(result).toEqual([mockProduct]);
  });
});

describe('getAllProducts', () => {
  it('queries all products ordered by name', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([mockProduct]);
    const result = await getAllProducts();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM products ORDER BY name ASC'
    );
    expect(result).toEqual([mockProduct]);
  });
});

describe('createProduct', () => {
  it('inserts product and returns new id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 5, changes: 1 });
    const id = await createProduct({ name: 'Cookie', price: 35, emoji: '🍪' });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT INTO products (name, price, emoji, is_active, created_at) VALUES (?, ?, ?, 1, ?)',
      ['Cookie', 35, '🍪', expect.any(String)]
    );
    expect(id).toBe(5);
  });
});

describe('updateProduct', () => {
  it('updates name, price, emoji and is_active by id', async () => {
    await updateProduct(1, { name: 'Big Cake', price: 150, emoji: '🎂', is_active: 0 });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE products SET name = ?, price = ?, emoji = ?, is_active = ? WHERE id = ?',
      ['Big Cake', 150, '🎂', 0, 1]
    );
  });
});
