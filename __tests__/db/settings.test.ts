import { getAdminHash, setAdminHash } from '../../db/settings';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => jest.clearAllMocks());

describe('getAdminHash', () => {
  it('queries settings for admin_password_hash', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'abc123' });
    const result = await getAdminHash();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['admin_password_hash']
    );
    expect(result).toBe('abc123');
  });

  it('returns null when no row found', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getAdminHash();
    expect(result).toBeNull();
  });
});

describe('setAdminHash', () => {
  it('upserts admin_password_hash in settings', async () => {
    await setAdminHash('newhash');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['admin_password_hash', 'newhash']
    );
  });
});
