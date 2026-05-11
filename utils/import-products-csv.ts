import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { CATALOG_CSV_NAME } from './products-csv-format';

export type PickedArchive = { csvText: string; zip: JSZip };

export async function pickProductsZip(): Promise<PickedArchive | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(base64, { base64: true });
  } catch {
    throw new Error('Selected file is not a valid .zip archive.');
  }

  const csvEntry = zip.file(CATALOG_CSV_NAME);
  if (!csvEntry) {
    throw new Error(`Archive is missing ${CATALOG_CSV_NAME}.`);
  }
  const csvText = await csvEntry.async('string');
  return { csvText, zip };
}
