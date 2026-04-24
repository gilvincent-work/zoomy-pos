import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import type { Transaction } from '../db/transactions';

function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function formatItems(transaction: Transaction): string {
  return transaction.items
    .map((i) => `${i.quantity} ${i.product_name}`)
    .join(', ');
}

function formatPaymentMethod(method: string, refNumber: string | null, isBundle: boolean): string {
  const label = method === 'gcash' ? 'GCash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash';
  const withRef = refNumber ? `${label} (${refNumber})` : label;
  return isBundle ? `${withRef} · Bundle` : withRef;
}

function proofFileName(transactionId: number): string {
  return `proof_txn_${transactionId}.jpg`;
}

export async function exportTransactionsZip(transactions: Transaction[], label: string): Promise<void> {
  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderName = `zoomy-sales-${label}-${dateStr}`;

  const header = ['#', 'Time', 'Qty. & Items', 'Total Sales', 'Payment Method', 'Furbaby/IG Handle', 'Proof Photo', 'Status'];

  const rows = await Promise.all(
    transactions.map(async (t, index) => {
      let photoFilename = '';

      if (t.proof_photo_uri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(t.proof_photo_uri);
          if (fileInfo.exists) {
            photoFilename = proofFileName(t.id);
            const base64 = await FileSystem.readAsStringAsync(t.proof_photo_uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            zip.file(photoFilename, base64, { base64: true });
          }
        } catch {
          // photo missing or unreadable — skip silently
        }
      }

      return [
        csvCell(index + 1),
        csvCell(formatTime(t.created_at)),
        csvCell(formatItems(t)),
        csvCell(`₱${t.total.toFixed(2)}`),
        csvCell(formatPaymentMethod(t.payment_method, t.ref_number, t.is_bundle)),
        csvCell(t.customer_handle),
        csvCell(photoFilename),
        csvCell(t.status === 'voided' ? 'VOIDED' : ''),
      ];
    })
  );

  const csv = [header.map(csvCell), ...rows]
    .map((row) => row.join(','))
    .join('\n');

  zip.file('transactions.csv', csv);

  const zipBase64 = await zip.generateAsync({ type: 'base64' });
  const zipPath = `${FileSystem.cacheDirectory}${folderName}.zip`;
  await FileSystem.writeAsStringAsync(zipPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(zipPath, {
    mimeType: 'application/zip',
    dialogTitle: 'Export Transactions',
    UTI: 'public.zip-archive',
  });
}
