import { seedDevProducts, DEV_SEED_VERSION, syncCatalogNamesOnce } from '../../db/seed';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
});

const productInserts = () =>
  mockDb.runAsync.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO products'));

const bundleInserts = () =>
  mockDb.runAsync.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO saved_bundles'));

describe('seedDevProducts', () => {
  it('is a no-op when the stored seed version already matches', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: DEV_SEED_VERSION }); // version lookup
    await seedDevProducts();
    expect(productInserts()).toHaveLength(0);
    expect(mockDb.execAsync).not.toHaveBeenCalledWith('DELETE FROM products');
  });

  it('reseeds a pre-versioning database that has no seed marker', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null); // no version marker (old seed)
    await seedDevProducts();
    expect(mockDb.execAsync).toHaveBeenCalledWith('DELETE FROM products');
    expect(productInserts()).toHaveLength(26);
  });

  it('seeds the real catalog and records the version', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null); // no version marker
    await seedDevProducts();

    expect(mockDb.execAsync).toHaveBeenCalledWith('DELETE FROM products');
    const inserts = productInserts();
    expect(inserts).toHaveLength(26);

    const salmonCubes = inserts.find((c) => c[1][0] === 'Salmon Cubes');
    expect(salmonCubes?.[1]).toEqual(
      expect.arrayContaining(['Salmon Cubes', 170, 'Freeze Dried', 'Fish'])
    );
    // Accurate product names from the SKU sheet (e.g. Tasty Treats "Chicken Jerky").
    const chickenJerky = inserts.find((c) => c[1][0] === 'Chicken Jerky');
    expect(chickenJerky?.[1]).toEqual(
      expect.arrayContaining(['Chicken Jerky', 300, 'Tasty Treats'])
    );
    // Starter "buy any N" deals are seeded alongside the catalog.
    expect(bundleInserts()).toHaveLength(2);
    // Version marker persisted.
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('dev_seed_version', ?)",
      [DEV_SEED_VERSION]
    );
  });

  it('re-seeds when a previous, different seed version is present', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'old-version' }); // stale marker
    await seedDevProducts();
    expect(mockDb.execAsync).toHaveBeenCalledWith('DELETE FROM products');
    expect(productInserts()).toHaveLength(26);
  });
});

const nameUpdates = () =>
  mockDb.runAsync.mock.calls.filter(([sql]) =>
    String(sql).startsWith('UPDATE products SET name = ?')
  );

describe('syncCatalogNamesOnce', () => {
  it('is a no-op when already synced', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '2026-09-03-accurate-names' });
    await syncCatalogNamesOnce();
    expect(nameUpdates()).toHaveLength(0);
  });

  it('renames placeholder names, scoped by category and subcategory', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null) // version marker: not synced
      .mockResolvedValueOnce({ id: 1 }); // Beef Blueberry already present
    await syncCatalogNamesOnce();

    const updates = nameUpdates();
    expect(updates.length).toBeGreaterThanOrEqual(10);
    // Tasty Treats Chicken -> Chicken Jerky, scoped so Meaty Treats "Chicken" is untouched.
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE products SET name = ? WHERE category = ? AND subcategory IS NULL AND name = ?',
      ['Chicken Jerky', 'Tasty Treats', 'Chicken']
    );
    // Version marker persisted.
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('catalog_name_sync_version', ?)",
      ['2026-09-03-accurate-names']
    );
  });

  it('adds Beef Blueberry when it is missing', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null) // version marker
      .mockResolvedValueOnce(null); // Beef Blueberry not present
    await syncCatalogNamesOnce();

    const beefBlueberry = productInserts().find((c) => c[1][0] === 'Beef Blueberry');
    expect(beefBlueberry?.[1]).toEqual(
      expect.arrayContaining(['Beef Blueberry', 170, 'Freeze Dried', 'Super Food'])
    );
  });
});
