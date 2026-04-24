import { getAdminHash, setAdminHash, getGcashQrUri, setGcashQrUri, removeGcashQrUri } from '../../db/settings';
import { mockDb } from '../../__mocks__/expo-sqlite';
import { getInfoAsync } from 'expo-file-system/legacy';

const mockGetInfoAsync = getInfoAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockGetInfoAsync.mockResolvedValue({ exists: true });
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
  it('resolves filename to full URI', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'qr.jpg' });
    const result = await getGcashQrUri();
    expect(result).toBe('file:///mock/documents/qr.jpg');
  });

  it('resolves legacy absolute path to filename-based URI', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '/old/path/to/qr.jpg' });
    const result = await getGcashQrUri();
    expect(result).toBe('file:///mock/documents/qr.jpg');
  });

  it('returns data URI directly', async () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJ';
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: dataUri });
    const result = await getGcashQrUri();
    expect(result).toBe(dataUri);
  });

  it('returns null when file does not exist', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'missing.jpg' });
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false });
    const result = await getGcashQrUri();
    expect(result).toBeNull();
  });

  it('returns null when no QR is set', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getGcashQrUri();
    expect(result).toBeNull();
  });
});

describe('setGcashQrUri', () => {
  it('stores the value as-is', async () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQ';
    await setGcashQrUri(dataUri);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['gcash_qr_uri', dataUri]
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
