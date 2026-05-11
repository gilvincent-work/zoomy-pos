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
      const response = await fetch(p.image_uri);
      if (!response.ok) continue;
      const blob = await response.blob();
      const entryPath = productImageEntryPath(p.name);
      zip.file(entryPath, blob);
      productImageFilenames.set(p.id, entryPath);
    } catch {
      // missing/unreadable image — skip silently
    }
  }

  const csv = serializeCatalog(products, variantsByProductId, bundles, productImageFilenames);
  zip.file(CATALOG_CSV_NAME, csv);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archiveName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
