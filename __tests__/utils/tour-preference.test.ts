import { loadTourSeen, saveTourSeen } from '../../utils/tour-preference';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => jest.clearAllMocks());

describe('loadTourSeen', () => {
  it('is false when the flag was never stored', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await loadTourSeen()).toBe(false);
  });

  it('is true once the flag is stored', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: '1' });
    expect(await loadTourSeen()).toBe(true);
  });

  it('reads the tour_seen key from settings', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    await loadTourSeen();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT value FROM settings WHERE key = ?',
      ['tour_seen']
    );
  });
});

describe('saveTourSeen', () => {
  it('upserts tour_seen as 1', async () => {
    await saveTourSeen();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['tour_seen', '1']
    );
  });
});
