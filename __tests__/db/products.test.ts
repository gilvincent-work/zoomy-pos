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
  has_variants: 0,
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
  it('queries all products with variant count ordered by name', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([{ ...mockProduct, variant_count: 0 }]);
    const result = await getAllProducts();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN product_variants')
    );
    expect(result).toEqual([{ ...mockProduct, variant_count: 0 }]);
  });
});

describe('createProduct', () => {
  it('inserts product and returns new id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 5, changes: 1 });
    const id = await createProduct({ name: 'Cookie', price: 35, has_variants: false });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT INTO products (name, price, emoji, has_variants, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      ['Cookie', 35, '🍬', 0, expect.any(String)]
    );
    expect(id).toBe(5);
  });
});

describe('updateProduct', () => {
  it('updates name, price, has_variants and is_active by id', async () => {
    await updateProduct(1, { name: 'Big Cake', price: 150, has_variants: false, is_active: 0 });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE products SET name = ?, price = ?, has_variants = ?, is_active = ? WHERE id = ?',
      ['Big Cake', 150, 0, 0, 1]
    );
  });
});
