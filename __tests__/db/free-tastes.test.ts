import {
  deleteFreeTaste,
  getRecentFreeTastes,
  getPendingFreeTastes,
  getFreeTasteByClientUuid,
} from '../../db/free-tastes';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('deleteFreeTaste', () => {
  it('deletes the local row by client_uuid (idempotent undo)', async () => {
    await deleteFreeTaste('uuid-1');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM free_tastes WHERE client_uuid = ?',
      ['uuid-1']
    );
  });
});

describe('getRecentFreeTastes', () => {
  it('reads the most recent rows newest first with a limit', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getRecentFreeTastes(10);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM free_tastes ORDER BY opened_at DESC LIMIT ?',
      [10]
    );
  });
});

describe('getFreeTasteByClientUuid', () => {
  it('reads the current row by client_uuid so undo never trusts a stale snapshot', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ client_uuid: 'uuid-1', synced_at: '2026-09-26T00:00:00.000Z' });
    const row = await getFreeTasteByClientUuid('uuid-1');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT * FROM free_tastes WHERE client_uuid = ?',
      ['uuid-1']
    );
    expect(row).toMatchObject({ client_uuid: 'uuid-1', synced_at: '2026-09-26T00:00:00.000Z' });
  });

  it('returns null when the row is gone', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await getFreeTasteByClientUuid('missing')).toBeNull();
  });
});

describe('getPendingFreeTastes', () => {
  it('reads unsynced rows oldest first', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getPendingFreeTastes();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM free_tastes WHERE synced_at IS NULL ORDER BY opened_at ASC'
    );
  });
});
