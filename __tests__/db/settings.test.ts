import { getAdminHash, setAdminHash, getQrUri, setQrUri, removeQrUri, getAllQrUris } from '../../db/settings';
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

describe('getQrUri', () => {
  it('resolves filename to full URI', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'qr.jpg' });
    const result = await getQrUri('gcash');
    expect(result).toBe('file:///mock/documents/qr.jpg');
  });

  it('resolves legacy absolute path to filename-based URI', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '/old/path/to/qr.jpg' });
    const result = await getQrUri('gcash');
    expect(result).toBe('file:///mock/documents/qr.jpg');
  });

  it('returns data URI directly', async () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJ';
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: dataUri });
    const result = await getQrUri('gcash');
    expect(result).toBe(dataUri);
  });

  it('returns null when file does not exist', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'missing.jpg' });
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false });
    const result = await getQrUri('gcash');
    expect(result).toBeNull();
  });

  it('returns null when no QR is set', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const result = await getQrUri('gcash');
    expect(result).toBeNull();
  });

  it('queries correct key for maya', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    await getQrUri('maya');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['qr_maya']
    );
  });

  it('queries correct key for bpi', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    await getQrUri('bpi');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['qr_bpi']
    );
  });
});

describe('setQrUri', () => {
  it('stores under qr_gcash key', async () => {
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQ';
    await setQrUri('gcash', dataUri);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['qr_gcash', dataUri]
    );
  });

  it('stores under qr_bpi key', async () => {
    await setQrUri('bpi', 'data:image/jpeg;base64,abc');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['qr_bpi', 'data:image/jpeg;base64,abc']
    );
  });
});

describe('removeQrUri', () => {
  it('deletes qr_gcash from settings', async () => {
    await removeQrUri('gcash');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM settings WHERE key = ?',
      ['qr_gcash']
    );
  });

  it('deletes qr_maya from settings', async () => {
    await removeQrUri('maya');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM settings WHERE key = ?',
      ['qr_maya']
    );
  });
});

describe('getAllQrUris', () => {
  it('returns all three QR URIs', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ value: 'data:image/jpeg;base64,gcash' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: 'data:image/jpeg;base64,bpi' });
    const result = await getAllQrUris();
    expect(result).toEqual({
      gcash: 'data:image/jpeg;base64,gcash',
      maya: null,
      bpi: 'data:image/jpeg;base64,bpi',
    });
  });

  it('returns all nulls when no QRs uploaded', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const result = await getAllQrUris();
    expect(result).toEqual({ gcash: null, maya: null, bpi: null });
  });
});
