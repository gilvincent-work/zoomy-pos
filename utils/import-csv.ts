import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { processCSV, ImportResult } from './import-csv-parser';

export async function importTransactionsZip(): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/zip',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return { imported: 0, skipped: 0, failed: 0, photosMissing: 0 };
  }

  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const zip = await JSZip.loadAsync(base64, { base64: true });

  const csvFile = zip.file('transactions.csv');
  if (!csvFile) throw new Error('transactions.csv not found in this file.');

  const csvText = await csvFile.async('string');
  return processCSV(csvText, zip);
}
