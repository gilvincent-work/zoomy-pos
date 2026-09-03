import {
  getSavedBundles,
  getActivePickBundles,
  getSavedBundleById,
  savePickBundle,
  updatePickBundle,
  validatePickBundleInput,
  PickBundleInput,
} from '../../db/saved-bundles';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

const pickRow = {
  id: 3,
  name: 'Buy Any 4',
  items_json: '[]',
  price: 570,
  bundle_type: 'pick',
  pick_count: 4,
  line_categories: '["Freeze Dried","Meaty Treats"]',
  is_active: 1,
  created_at: '2026-09-03T10:00:00.000Z',
};

const validInput: PickBundleInput = {
  name: 'Buy Any 4',
  price: 570,
  pickCount: 4,
  lineCategories: ['Freeze Dried', 'Meaty Treats'],
};

describe('validatePickBundleInput', () => {
  it('returns null for valid input', () => {
    expect(validatePickBundleInput(validInput)).toBeNull();
  });

  it('rejects a blank name', () => {
    expect(validatePickBundleInput({ ...validInput, name: '  ' })).toBe('Enter a bundle name.');
  });

  it('rejects a negative or non-finite price', () => {
    expect(validatePickBundleInput({ ...validInput, price: -1 })).toBe('Enter a valid price.');
    expect(validatePickBundleInput({ ...validInput, price: NaN })).toBe('Enter a valid price.');
  });

  it('requires an amount of at least 1', () => {
    expect(validatePickBundleInput({ ...validInput, pickCount: 0 })).toBe(
      'Amount of items must be at least 1.'
    );
  });

  it('requires at least one product line', () => {
    expect(validatePickBundleInput({ ...validInput, lineCategories: [] })).toBe(
      'Select at least one product line.'
    );
  });
});

describe('getActivePickBundles', () => {
  it('queries only active pick bundles and parses line_categories', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([pickRow]);
    const result = await getActivePickBundles();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("bundle_type = 'pick'")
    );
    expect(result[0]).toMatchObject({
      id: 3,
      bundle_type: 'pick',
      pick_count: 4,
      line_categories: ['Freeze Dried', 'Meaty Treats'],
      items: [],
    });
  });
});

describe('getSavedBundles', () => {
  it('maps a legacy fixed bundle with null line_categories', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { ...pickRow, bundle_type: 'fixed', pick_count: null, line_categories: null, items_json: '[{"id":1,"name":"Beef","quantity":2}]' },
    ]);
    const result = await getSavedBundles();
    expect(result[0]).toMatchObject({
      bundle_type: 'fixed',
      pick_count: null,
      line_categories: null,
      items: [{ id: 1, name: 'Beef', quantity: 2 }],
    });
  });
});

describe('getSavedBundleById', () => {
  it('returns the mapped bundle when found', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(pickRow);
    const result = await getSavedBundleById(3);
    expect(result).toMatchObject({ id: 3, pick_count: 4 });
  });

  it('returns null when not found', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await getSavedBundleById(999)).toBeNull();
  });
});

describe('savePickBundle', () => {
  it('inserts a pick bundle with empty items and returns the new id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 7, changes: 1 });
    const id = await savePickBundle(validInput);
    expect(id).toBe(7);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO saved_bundles');
    expect(params).toEqual([
      'Buy Any 4',
      '[]',
      570,
      'pick',
      4,
      '["Freeze Dried","Meaty Treats"]',
      expect.any(String),
    ]);
  });
});

describe('updatePickBundle', () => {
  it('updates name, price, pick_count and line_categories', async () => {
    await updatePickBundle(3, validInput);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('UPDATE saved_bundles SET name = ?, price = ?, pick_count = ?, line_categories = ?');
    expect(params).toEqual(['Buy Any 4', 570, 4, '["Freeze Dried","Meaty Treats"]', 3]);
  });
});
