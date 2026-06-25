import JSZip from 'jszip';
import type { PaymentMethod } from '../db/transactions';
import { importTransaction, transactionExists } from '../db/transactions';

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  photosMissing: number;
};

export function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parsePaymentMethod(methodStr: string): {
  paymentMethod: PaymentMethod;
  refNumber: string | null;
  isBundle: boolean;
} {
  const isBundle = methodStr.includes(' · Bundle');
  const withoutBundle = methodStr.replace(' · Bundle', '').trim();
  const refMatch = withoutBundle.match(/\((.+?)\)/);
  const refNumber = refMatch ? refMatch[1] : null;
  const label = withoutBundle.replace(/\s*\(.+?\)/, '').trim();

  const methodMap: Record<string, PaymentMethod> = {
    GCash: 'gcash',
    Maya: 'maya',
    BPI: 'bpi',
    'Bank Transfer': 'bank_transfer',
    Cash: 'cash',
  };

  return { paymentMethod: methodMap[label] ?? 'cash', refNumber, isBundle };
}

export type ParsedItemRow = {
  transactionNumber: string;
  time: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  itemTotal: number;
  transactionTotal: number;
  paymentMethod: string;
  customerHandle: string;
  proofPhoto: string;
  status: string;
};

export function parseItemRow(cells: string[]): ParsedItemRow {
  const [num, time, item, flavor, qty, itemTotal, txnTotal, method, handle, photo, status] = cells;
  return {
    transactionNumber: num,
    time,
    productName: item,
    variantName: flavor.trim() ? flavor : null,
    quantity: parseInt(qty, 10),
    itemTotal: parseFloat(itemTotal.replace('₱', '')),
    transactionTotal: parseFloat(txnTotal.replace('₱', '')),
    paymentMethod: method,
    customerHandle: handle,
    proofPhoto: photo,
    status,
  };
}

export function groupRowsByTransaction(rows: ParsedItemRow[]): ParsedItemRow[][] {
  const groups: ParsedItemRow[][] = [];
  let current: ParsedItemRow[] = [];
  let currentNumber: string | null = null;

  for (const row of rows) {
    if (row.transactionNumber !== currentNumber) {
      if (current.length) groups.push(current);
      current = [];
      currentNumber = row.transactionNumber;
    }
    current.push(row);
  }
  if (current.length) groups.push(current);

  return groups;
}

export async function processCSV(csvText: string, zip: JSZip): Promise<ImportResult> {
  const lines = csvText.split('\n').filter((l) => l.trim());
  const [header, ...dataLines] = lines;

  if (!header || !header.includes('Time')) throw new Error('Invalid CSV format.');

  let imported = 0, skipped = 0, failed = 0, photosMissing = 0;

  const parsedRows: ParsedItemRow[] = [];
  for (const line of dataLines) {
    const cells = parseCSVRow(line);
    if (cells.length < 11) { failed++; continue; }
    parsedRows.push(parseItemRow(cells));
  }

  const groups = groupRowsByTransaction(parsedRows);

  for (const group of groups) {
    try {
      const first = group[0];
      const total = first.transactionTotal;
      if (isNaN(total)) { failed++; continue; }

      const createdAt = new Date(first.time).toISOString();
      const createdAtMinute = createdAt.slice(0, 16);

      if (await transactionExists(createdAtMinute, total)) { skipped++; continue; }

      const items = group.map((row) => ({
        productName: row.productName,
        variantName: row.variantName,
        quantity: row.quantity,
        price: row.quantity > 0 ? row.itemTotal / row.quantity : 0,
      }));

      const { paymentMethod, refNumber, isBundle } = parsePaymentMethod(first.paymentMethod);
      const customerHandle = first.customerHandle.trim() || null;
      const status: 'completed' | 'voided' = first.status.trim() === 'VOIDED' ? 'voided' : 'completed';

      let proofPhotoUri: string | undefined;
      const photoFilename = first.proofPhoto.trim();
      if (photoFilename) {
        const photoFile = zip.file(photoFilename);
        if (photoFile) {
          const base64 = await photoFile.async('base64');
          proofPhotoUri = `data:image/jpeg;base64,${base64}`;
        } else {
          photosMissing++;
        }
      }

      await importTransaction({
        total,
        cashTendered: total,
        change: 0,
        paymentMethod,
        refNumber: refNumber ?? undefined,
        proofPhotoUri,
        customerHandle: customerHandle ?? undefined,
        isBundle,
        status,
        createdAt,
        items,
      });

      imported++;
    } catch {
      failed++;
    }
  }

  return { imported, skipped, failed, photosMissing };
}
