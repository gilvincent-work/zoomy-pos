import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getActiveProducts,
  getVariantsByProductId,
  type ProductVariant,
} from '../db/products';
import { getSavedBundles } from '../db/saved-bundles';
import { serializeCatalog } from './products-csv-format';

function fileName(): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `zoomy-products-${dateStr}.csv`;
}

async function buildCsv(): Promise<string> {
  const products = await getActiveProducts();
  const variantsByProductId = new Map<number, ProductVariant[]>();
  for (const p of products) {
    if (p.has_variants) {
      variantsByProductId.set(p.id, await getVariantsByProductId(p.id));
    }
  }
  const bundles = await getSavedBundles();
  return serializeCatalog(products, variantsByProductId, bundles);
}

export async function exportProductsCsv(): Promise<void> {
  const csv = await buildCsv();
  const path = `${FileSystem.cacheDirectory}${fileName()}`;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Product Catalog',
    UTI: 'public.comma-separated-values-text',
  });
}
