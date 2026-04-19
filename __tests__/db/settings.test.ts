import { getAdminHash, setAdminHash, getGcashQrUri, setGcashQrUri, removeGcashQrUri } from '../../db/settings';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

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

describe('getGcashQrUri', () => {
  it('queries settings for gcash_qr_uri', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '/path/to/qr.jpg' });
    const result = await getGcashQrUri();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['gcash_qr_uri']
    );
    expect(result).toBe('/path/to/qr.jpg');
  });

  it('returns null when no QR is set', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getGcashQrUri();
    expect(result).toBeNull();
  });
});

describe('setGcashQrUri', () => {
  it('upserts gcash_qr_uri in settings', async () => {
    await setGcashQrUri('/path/to/qr.jpg');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['gcash_qr_uri', '/path/to/qr.jpg']
    );
  });
});

describe('removeGcashQrUri', () => {
  it('deletes gcash_qr_uri from settings', async () => {
    await removeGcashQrUri();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM settings WHERE key = ?',
      ['gcash_qr_uri']
    );
  });
});
