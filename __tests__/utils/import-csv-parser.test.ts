import { parseCSVRow, parseItems, parsePaymentMethod, processCSV } from '../../utils/import-csv-parser';

jest.mock('../../db/transactions', () => ({
  importTransaction: jest.fn().mockResolvedValue(1),
  transactionExists: jest.fn().mockResolvedValue(false),
}));

import { importTransaction, transactionExists } from '../../db/transactions';
const mockImport = importTransaction as jest.Mock;
const mockExists = transactionExists as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('parseCSVRow', () => {
  it('splits a simple row by commas', () => {
    expect(parseCSVRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCSVRow('"Apr 24, 2026 03:36 PM",140')).toEqual([
      'Apr 24, 2026 03:36 PM',
      '140',
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    expect(parseCSVRow('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles trailing empty cell', () => {
    expect(parseCSVRow('a,b,')).toEqual(['a', 'b', '']);
  });
});

describe('parseItems', () => {
  it('parses a single item', () => {
    expect(parseItems('1 jerky treats')).toEqual([
      { quantity: 1, productName: 'jerky treats' },
    ]);
  });

  it('parses multiple items', () => {
    expect(parseItems('2 dog food, 1 cat toy')).toEqual([
      { quantity: 2, productName: 'dog food' },
      { quantity: 1, productName: 'cat toy' },
    ]);
  });

  it('handles product names with numbers', () => {
    expect(parseItems('1 2kg dog food')).toEqual([
      { quantity: 1, productName: '2kg dog food' },
    ]);
  });
});

describe('parsePaymentMethod', () => {
  it('maps GCash label to gcash', () => {
    expect(parsePaymentMethod('GCash')).toMatchObject({ paymentMethod: 'gcash', refNumber: null, isBundle: false });
  });

  it('extracts ref number from parentheses', () => {
    expect(parsePaymentMethod('GCash (ref123)')).toMatchObject({ paymentMethod: 'gcash', refNumber: 'ref123' });
  });

  it('detects Bundle suffix', () => {
    expect(parsePaymentMethod('GCash · Bundle')).toMatchObject({ isBundle: true });
  });

  it('handles ref number and bundle together', () => {
    expect(parsePaymentMethod('Maya (abc) · Bundle')).toMatchObject({
      paymentMethod: 'maya',
      refNumber: 'abc',
      isBundle: true,
    });
  });

  it('maps Bank Transfer label', () => {
    expect(parsePaymentMethod('Bank Transfer')).toMatchObject({ paymentMethod: 'bank_transfer' });
  });

  it('maps Cash label', () => {
    expect(parsePaymentMethod('Cash')).toMatchObject({ paymentMethod: 'cash' });
  });
});

describe('processCSV', () => {
  const mockZip = {
    file: jest.fn().mockReturnValue({
      async: jest.fn().mockResolvedValue('base64photodata'),
    }),
  };

  const sampleCSV = [
    '#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status',
    '1,"Apr 24, 2026 03:36 PM",1 jerky treats,₱140.00,GCash,,proof_txn_1.jpg,',
  ].join('\n');

  it('imports one transaction and returns correct counts', async () => {
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 1, skipped: 0, failed: 0, photosMissing: 0 });
    expect(mockImport).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate transactions', async () => {
    mockExists.mockResolvedValueOnce(true);
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 0, skipped: 1, failed: 0, photosMissing: 0 });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('counts photosMissing when photo file not in ZIP', async () => {
    const zipWithoutPhoto = { file: jest.fn().mockReturnValue(null) };
    const result = await processCSV(sampleCSV, zipWithoutPhoto as any);
    expect(result.imported).toBe(1);
    expect(result.photosMissing).toBe(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ proofPhotoUri: undefined })
    );
  });

  it('imports voided transactions correctly', async () => {
    const voidedCSV = [
      '#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status',
      '1,"Apr 24, 2026 03:36 PM",1 jerky treats,₱140.00,Cash,,,VOIDED',
    ].join('\n');
    await processCSV(voidedCSV, mockZip as any);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'voided' })
    );
  });

  it('counts failed for unparseable rows', async () => {
    const badCSV = [
      '#,Time,Qty. & Items,Total Sales,Payment Method,Furbaby/IG Handle,Proof Photo,Status',
      'not,enough,cells',
    ].join('\n');
    const result = await processCSV(badCSV, mockZip as any);
    expect(result).toMatchObject({ imported: 0, failed: 1 });
  });

  it('throws when transactions.csv header is missing', async () => {
    await expect(processCSV('', mockZip as any)).rejects.toThrow('Invalid CSV');
  });
});
