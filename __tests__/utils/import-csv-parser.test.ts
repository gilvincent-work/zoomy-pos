import { parseCSVRow, parsePaymentMethod, parseItemRow, groupRowsByTransaction, processCSV } from '../../utils/import-csv-parser';

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

describe('parseItemRow', () => {
  it('parses a row with a flavor', () => {
    const cells = ['1', 'Apr 24, 2026 03:36 PM', 'Jerky Treats', 'Chicken', '2', '₱200.00', '₱200.00', 'GCash', '@zoomypets', 'proof_txn_1.jpg', ''];
    expect(parseItemRow(cells)).toEqual({
      transactionNumber: '1',
      time: 'Apr 24, 2026 03:36 PM',
      productName: 'Jerky Treats',
      variantName: 'Chicken',
      quantity: 2,
      itemTotal: 200,
      transactionTotal: 200,
      paymentMethod: 'GCash',
      customerHandle: '@zoomypets',
      proofPhoto: 'proof_txn_1.jpg',
      status: '',
    });
  });

  it('treats a blank Flavor cell as null', () => {
    const cells = ['1', 'Apr 24, 2026 03:36 PM', 'Mango Juice', '', '1', '₱40.00', '₱40.00', 'Cash', '', '', ''];
    expect(parseItemRow(cells).variantName).toBeNull();
  });
});

describe('groupRowsByTransaction', () => {
  it('groups consecutive rows sharing the same transaction number', () => {
    const rows = [
      parseItemRow(['1', 't', 'A', '', '1', '₱10.00', '₱50.00', 'Cash', '', '', '']),
      parseItemRow(['1', 't', 'B', '', '1', '₱40.00', '₱50.00', 'Cash', '', '', '']),
      parseItemRow(['2', 't', 'C', '', '1', '₱10.00', '₱10.00', 'Cash', '', '', '']),
    ];
    const groups = groupRowsByTransaction(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });
});

describe('processCSV', () => {
  const mockZip = {
    file: jest.fn().mockReturnValue({
      async: jest.fn().mockResolvedValue('base64photodata'),
    }),
  };
  const header = '#,Time,Item,Flavor,Qty,Item Total,Transaction Total,Payment Method,Furbaby/IG Handle,Proof Photo,Status';

  const sampleCSV = [
    header,
    '1,"Apr 24, 2026 03:36 PM",jerky treats,,1,₱140.00,₱140.00,GCash,,proof_txn_1.jpg,',
  ].join('\n');

  it('imports one transaction and returns correct counts', async () => {
    const result = await processCSV(sampleCSV, mockZip as any);
    expect(result).toEqual({ imported: 1, skipped: 0, failed: 0, photosMissing: 0 });
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 140,
        items: [{ productName: 'jerky treats', variantName: null, quantity: 1, price: 140 }],
      })
    );
  });

  it('groups a multi-item transaction into a single import call with both items', async () => {
    const multiItemCSV = [
      header,
      '1,"Apr 24, 2026 03:36 PM",Jerky Treats,Chicken,1,₱100.00,₱140.00,GCash,,,',
      '1,"Apr 24, 2026 03:36 PM",Mango Juice,,1,₱40.00,₱140.00,GCash,,,',
    ].join('\n');

    const result = await processCSV(multiItemCSV, mockZip as any);
    expect(result.imported).toBe(1);
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 140,
        items: [
          { productName: 'Jerky Treats', variantName: 'Chicken', quantity: 1, price: 100 },
          { productName: 'Mango Juice', variantName: null, quantity: 1, price: 40 },
        ],
      })
    );
  });

  it('skips duplicate transactions using the Transaction Total column', async () => {
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
      header,
      '1,"Apr 24, 2026 03:36 PM",jerky treats,,1,₱140.00,₱140.00,Cash,,,VOIDED',
    ].join('\n');
    await processCSV(voidedCSV, mockZip as any);
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'voided' })
    );
  });

  it('counts failed for rows with too few cells', async () => {
    const badCSV = [header, 'not,enough,cells'].join('\n');
    const result = await processCSV(badCSV, mockZip as any);
    expect(result).toMatchObject({ imported: 0, failed: 1 });
  });

  it('throws when transactions.csv header is missing', async () => {
    await expect(processCSV('', mockZip as any)).rejects.toThrow('Invalid CSV');
  });
});
