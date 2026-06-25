import * as FileSystem from 'expo-file-system/legacy';
import type JSZip from 'jszip';
import { productImageBasename } from './products-csv-format';

export type ResolveImage = (
  filename: string,
  productName: string
) => Promise<string | null>;

export function makeImageResolver(zip: JSZip): ResolveImage {
  return async (filename, productName) => {
    const entry = zip.file(filename);
    if (!entry) return null;
    const base64 = await entry.async('base64');
    const destUri = `${FileSystem.documentDirectory}${productImageBasename(productName)}`;
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destUri;
  };
}
