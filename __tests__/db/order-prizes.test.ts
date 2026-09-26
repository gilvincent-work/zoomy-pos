import {
  getOrderPrizesByOrder,
  getOrderPrizeByClientUuid,
  deleteOrderPrize,
} from '../../db/order-prizes';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('getOrderPrizesByOrder', () => {
  it('reads all prizes for an order, oldest first', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getOrderPrizesByOrder('order-1');
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM order_prizes WHERE order_client_uuid = ? ORDER BY won_at ASC',
      ['order-1']
    );
  });
});

describe('getOrderPrizeByClientUuid', () => {
  it('reads the current row by client_uuid so remove never trusts a stale snapshot', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ client_uuid: 'uuid-1', synced_at: null });
    const row = await getOrderPrizeByClientUuid('uuid-1');
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT * FROM order_prizes WHERE client_uuid = ?',
      ['uuid-1']
    );
    expect(row).toMatchObject({ client_uuid: 'uuid-1', synced_at: null });
  });

  it('returns null when the row is gone', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await getOrderPrizeByClientUuid('missing')).toBeNull();
  });
});

describe('deleteOrderPrize', () => {
  it('deletes the local row by client_uuid (idempotent undo)', async () => {
    await deleteOrderPrize('uuid-1');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM order_prizes WHERE client_uuid = ?',
      ['uuid-1']
    );
  });
});
