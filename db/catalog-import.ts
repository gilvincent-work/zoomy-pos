import { getDatabase } from './database';
import { upsertProduct, upsertVariant, setProductImageUri } from './products';
import { upsertBundleByName } from './saved-bundles';
import {
  bundleItemsToInput,
  type ParsedCatalog,
} from '../utils/products-csv-format';
import type { ResolveImage } from '../utils/import-images';

export type ImportSummary = {
  productsInserted: number;
  productsUpdated: number;
  variantsInserted: number;
  variantsUpdated: number;
  bundlesInserted: number;
  bundlesUpdated: number;
  imagesRestored: number;
  imagesMissing: number;
};

export type UpsertCatalogOptions = {
  resolveImage?: ResolveImage;
};

export async function upsertCatalog(
  parsed: ParsedCatalog,
  options: UpsertCatalogOptions = {}
): Promise<ImportSummary> {
  const db = await getDatabase();
  const summary: ImportSummary = {
    productsInserted: 0,
    productsUpdated: 0,
    variantsInserted: 0,
    variantsUpdated: 0,
    bundlesInserted: 0,
    bundlesUpdated: 0,
    imagesRestored: 0,
    imagesMissing: 0,
  };

  await db.execAsync('BEGIN');
  try {
    const productNameToId = new Map<string, number>();
    for (const p of parsed.products) {
      const result = await upsertProduct({
        name: p.name,
        price: p.price,
        emoji: p.emoji,
        has_variants: p.has_variants,
        category: p.category,
        subcategory: p.subcategory,
      });
      productNameToId.set(p.name, result.id);
      if (result.inserted) summary.productsInserted += 1;
      else summary.productsUpdated += 1;

      if (p.image_filename && options.resolveImage) {
        try {
          const uri = await options.resolveImage(p.image_filename, p.name);
          if (uri) {
            await setProductImageUri(result.id, uri);
            summary.imagesRestored += 1;
          } else {
            summary.imagesMissing += 1;
          }
        } catch {
          summary.imagesMissing += 1;
        }
      }
    }

    const variantKeyToId = new Map<string, number>();
    for (const v of parsed.variants) {
      const productId = productNameToId.get(v.parent_product_name);
      if (!productId) {
        throw new Error(
          `variant "${v.name}" references product "${v.parent_product_name}" which is not in the import`
        );
      }
      const result = await upsertVariant(productId, { name: v.name, price: v.price });
      variantKeyToId.set(`${productId}::${v.name}`, result.id);
      if (result.inserted) summary.variantsInserted += 1;
      else summary.variantsUpdated += 1;
    }

    for (const b of parsed.bundles) {
      const items = bundleItemsToInput(b.items, productNameToId, variantKeyToId);
      const result = await upsertBundleByName(b.name, items, b.price);
      if (result.inserted) summary.bundlesInserted += 1;
      else summary.bundlesUpdated += 1;
    }

    await db.execAsync('COMMIT');
    return summary;
  } catch (err) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw err;
  }
}
