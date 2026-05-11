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

export function parseItems(itemsStr: string): { productName: string; quantity: number }[] {
  const results: { productName: string; quantity: number }[] = [];
  const regex = /(\d+)\s+(.+?)(?=,\s+\d+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(itemsStr)) !== null) {
    results.push({ quantity: parseInt(match[1], 10), productName: match[2].trim() });
  }
  return results;
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

export async function processCSV(csvText: string, zip: JSZip): Promise<ImportResult> {
  const lines = csvText.split('\n').filter((l) => l.trim());
  const [header, ...dataLines] = lines;

  if (!header || !header.includes('Time')) throw new Error('Invalid CSV format.');

  let imported = 0, skipped = 0, failed = 0, photosMissing = 0;

  for (const line of dataLines) {
    try {
      const cells = parseCSVRow(line);
      if (cells.length < 8) { failed++; continue; }

      const [, timeStr, itemsStr, totalStr, methodStr, handleStr, photoFilename, statusStr] = cells;

      const total = parseFloat(totalStr.replace('₱', ''));
      if (isNaN(total)) { failed++; continue; }

      const createdAt = new Date(timeStr).toISOString();
      const createdAtMinute = createdAt.slice(0, 16);

      if (await transactionExists(createdAtMinute, total)) { skipped++; continue; }

      const items = parseItems(itemsStr);
      const { paymentMethod, refNumber, isBundle } = parsePaymentMethod(methodStr);
      const customerHandle = handleStr.trim() || null;
      const status: 'completed' | 'voided' = statusStr.trim() === 'VOIDED' ? 'voided' : 'completed';

      let proofPhotoUri: string | undefined;
      if (photoFilename.trim()) {
        const photoFile = zip.file(photoFilename.trim());
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
