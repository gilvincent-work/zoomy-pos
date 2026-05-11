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
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
