import JSZip from 'jszip';
import type { Transaction } from '../db/transactions';
import { EXPORT_HEADER, buildItemRows, proofFileName, csvCell } from './export-csv-shared';

export async function exportTransactionsZip(transactions: Transaction[], label: string): Promise<void> {
  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderName = `zoomy-sales-${label}-${dateStr}`;

  const photoFilenames = new Map<number, string>();
  for (const t of transactions) {
    if (!t.proof_photo_uri) continue;
    try {
      const response = await fetch(t.proof_photo_uri);
      if (response.ok) {
        const blob = await response.blob();
        const filename = proofFileName(t.id);
        zip.file(filename, blob);
        photoFilenames.set(t.id, filename);
      }
    } catch {
      // photo missing or unreadable — skip silently
    }
  }

  const rows = buildItemRows(transactions, photoFilenames);
  const csv = [EXPORT_HEADER.map(csvCell), ...rows]
    .map((row) => row.join(','))
    .join('\n');

  zip.file('transactions.csv', csv);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
