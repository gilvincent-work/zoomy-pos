import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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
      const fileInfo = await FileSystem.getInfoAsync(t.proof_photo_uri);
      if (fileInfo.exists) {
        const filename = proofFileName(t.id);
        const base64 = await FileSystem.readAsStringAsync(t.proof_photo_uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        zip.file(filename, base64, { base64: true });
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
