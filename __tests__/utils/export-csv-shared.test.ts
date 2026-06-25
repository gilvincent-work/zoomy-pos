import { csvCell, formatPaymentMethod, proofFileName, buildItemRows, EXPORT_HEADER } from '../../utils/export-csv-shared';
import type { Transaction } from '../../db/transactions';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    total: 140,
    cash_tendered: 140,
    change: 0,
    payment_method: 'gcash',
    ref_number: null,
    proof_photo_uri: null,
    customer_handle: null,
    is_bundle: false,
    status: 'completed',
    created_at: '2026-04-24T07:36:00.000Z',
    remarks: null,
    items: [],
    ...overrides,
  };
}

describe('EXPORT_HEADER', () => {
  it('has the expected 11 columns in order', () => {
    expect(EXPORT_HEADER).toEqual([
      '#', 'Time', 'Item', 'Flavor', 'Qty', 'Item Total', 'Transaction Total',
      'Payment Method', 'Furbaby/IG Handle', 'Proof Photo', 'Status',
    ]);
  });
});

describe('csvCell', () => {
  it('quotes values containing commas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
  });

  it('passes through plain values', () => {
    expect(csvCell('plain')).toBe('plain');
  });

  it('renders null/undefined as empty string', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('formatPaymentMethod', () => {
  it('maps gcash with a ref number', () => {
    expect(formatPaymentMethod('gcash', 'ref123', false)).toBe('GCash (ref123)');
  });

  it('appends Bundle suffix', () => {
    expect(formatPaymentMethod('cash', null, true)).toBe('Cash · Bundle');
  });
});

describe('proofFileName', () => {
  it('formats using the transaction id', () => {
    expect(proofFileName(7)).toBe('proof_txn_7.jpg');
  });
});

describe('buildItemRows', () => {
  it('emits one row per item with shared transaction fields repeated', () => {
    const t = makeTransaction({
      id: 1,
      items: [
        { id: 1, transaction_id: 1, product_id: 1, product_name: 'Jerky Treats', price: 100, quantity: 1, variant_id: 2, variant_name: 'Chicken' },
        { id: 2, transaction_id: 1, product_id: 3, product_name: 'Mango Juice', price: 40, quantity: 1, variant_id: null, variant_name: null },
      ],
    });
    const rows = buildItemRows([t], new Map());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      '1', expect.stringContaining('2026'), 'Jerky Treats', 'Chicken', '1', '₱100.00', '₱140.00',
      'GCash', '', '', '',
    ]);
    expect(rows[1][2]).toBe('Mango Juice');
    expect(rows[1][3]).toBe(''); // no flavor
    expect(rows[1][0]).toBe('1'); // same transaction number repeated
    expect(rows[1][6]).toBe('₱140.00'); // transaction total repeated
  });

  it('numbers transactions sequentially starting at 1', () => {
    const t1 = makeTransaction({ id: 1, items: [{ id: 1, transaction_id: 1, product_id: 1, product_name: 'A', price: 10, quantity: 1, variant_id: null, variant_name: null }] });
    const t2 = makeTransaction({ id: 2, items: [{ id: 2, transaction_id: 2, product_id: 1, product_name: 'B', price: 10, quantity: 1, variant_id: null, variant_name: null }] });
    const rows = buildItemRows([t1, t2], new Map());
    expect(rows[0][0]).toBe('1');
    expect(rows[1][0]).toBe('2');
  });

  it('looks up the proof photo filename by transaction id', () => {
    const t = makeTransaction({ id: 5, proof_photo_uri: 'file://x.jpg', items: [{ id: 1, transaction_id: 5, product_id: 1, product_name: 'A', price: 10, quantity: 1, variant_id: null, variant_name: null }] });
    const rows = buildItemRows([t], new Map([[5, 'proof_txn_5.jpg']]));
    expect(rows[0][9]).toBe('proof_txn_5.jpg');
  });

  it('produces no rows for a transaction with no items', () => {
    const t = makeTransaction({ items: [] });
    expect(buildItemRows([t], new Map())).toEqual([]);
  });
});
