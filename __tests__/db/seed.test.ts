import { seedDevProducts, DEV_SEED_VERSION } from '../../db/seed';
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
    expect(productInserts()).toHaveLength(25);
  });

  it('seeds the real catalog and records the version', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null); // no version marker
    await seedDevProducts();

    expect(mockDb.execAsync).toHaveBeenCalledWith('DELETE FROM products');
    const inserts = productInserts();
    expect(inserts).toHaveLength(25);

    const salmonCubes = inserts.find((c) => c[1][0] === 'Salmon Cubes');
    expect(salmonCubes?.[1]).toEqual(
      expect.arrayContaining(['Salmon Cubes', 170, 'Freeze Dried', 'Fish'])
    );
    // Duplicate display names across categories are kept as distinct products.
    expect(inserts.filter((c) => c[1][0] === 'Chicken')).toHaveLength(2);
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
    expect(productInserts()).toHaveLength(25);
  });
});
