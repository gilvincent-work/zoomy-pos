import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import {
  getActiveProducts,
  getVariantsByProductId,
  type Product,
  type ProductVariant,
} from '../db/products';
import { getSavedBundles } from '../db/saved-bundles';
import {
  CATALOG_CSV_NAME,
  productImageEntryPath,
  serializeCatalog,
} from './products-csv-format';

function archiveName(): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `zoomy-products-${dateStr}.zip`;
}

async function gatherCatalog(): Promise<{
  products: Product[];
  variantsByProductId: Map<number, ProductVariant[]>;
  bundles: Awaited<ReturnType<typeof getSavedBundles>>;
}> {
  const products = await getActiveProducts();
  const variantsByProductId = new Map<number, ProductVariant[]>();
  for (const p of products) {
    if (p.has_variants) {
      variantsByProductId.set(p.id, await getVariantsByProductId(p.id));
    }
  }
  const bundles = await getSavedBundles();
  return { products, variantsByProductId, bundles };
}

export async function exportProductsArchive(): Promise<void> {
  const { products, variantsByProductId, bundles } = await gatherCatalog();

  const zip = new JSZip();
  const productImageFilenames = new Map<number, string>();

  for (const p of products) {
    if (!p.image_uri) continue;
    try {
      const info = await FileSystem.getInfoAsync(p.image_uri);
      if (!info.exists) continue;
      const base64 = await FileSystem.readAsStringAsync(p.image_uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const entryPath = productImageEntryPath(p.name);
      zip.file(entryPath, base64, { base64: true });
      productImageFilenames.set(p.id, entryPath);
    } catch {
      // missing/unreadable image — skip silently
    }
  }

  const csv = serializeCatalog(products, variantsByProductId, bundles, productImageFilenames);
  zip.file(CATALOG_CSV_NAME, csv);

  const zipBase64 = await zip.generateAsync({ type: 'base64' });
  const zipPath = `${FileSystem.cacheDirectory}${archiveName()}`;
  await FileSystem.writeAsStringAsync(zipPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(zipPath, {
    mimeType: 'application/zip',
    dialogTitle: 'Export Product Catalog',
    UTI: 'public.zip-archive',
  });
}
