import type { Product, ProductVariant } from '../db/products';
import type { SavedBundle, BundleItemInput } from '../db/saved-bundles';

export const CATALOG_CSV_HEADER = [
  'type',
  'name',
  'price',
  'emoji',
  'has_variants',
  'parent_product_name',
  'bundle_items_json',
  'image_filename',
] as const;

export type ParsedProduct = {
  name: string;
  price: number | null;
  emoji: string;
  has_variants: number;
  image_filename: string | null;
};

export const CATALOG_CSV_NAME = 'catalog.csv';
export const CATALOG_IMAGES_DIR = 'images';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'product';
}

function hash4(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 4);
}

export function productImageBasename(productName: string): string {
  return `${slugify(productName)}-${hash4(productName)}.jpg`;
}

export function productImageEntryPath(productName: string): string {
  return `${CATALOG_IMAGES_DIR}/${productImageBasename(productName)}`;
}

export type ParsedVariant = {
  parent_product_name: string;
  name: string;
  price: number;
};

export type ParsedBundleItem = {
  product: string;
  variant?: string;
  qty: number;
};

export type ParsedBundle = {
  name: string;
  price: number;
  items: ParsedBundleItem[];
};

export type ParsedCatalog = {
  products: ParsedProduct[];
  variants: ParsedVariant[];
  bundles: ParsedBundle[];
};

export class ParseError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.line = line;
    this.name = 'ParseError';
  }
}

export function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeCatalog(
  products: Product[],
  variantsByProductId: Map<number, ProductVariant[]>,
  bundles: SavedBundle[],
  productImageFilenames: Map<number, string>
): string {
  const productNameById = new Map<number, string>();
  for (const p of products) productNameById.set(p.id, p.name);

  const variantNameById = new Map<number, string>();
  for (const list of variantsByProductId.values()) {
    for (const v of list) variantNameById.set(v.id, v.name);
  }

  const rows: string[][] = [CATALOG_CSV_HEADER.map((h) => csvCell(h))];

  for (const p of products) {
    rows.push([
      csvCell('product'),
      csvCell(p.name),
      csvCell(p.has_variants ? '' : (p.price ?? '')),
      csvCell(p.emoji),
      csvCell(p.has_variants),
      csvCell(''),
      csvCell(''),
      csvCell(productImageFilenames.get(p.id) ?? ''),
    ]);
  }

  for (const p of products) {
    const variants = variantsByProductId.get(p.id) ?? [];
    for (const v of variants) {
      rows.push([
        csvCell('variant'),
        csvCell(v.name),
        csvCell(v.price),
        csvCell(''),
        csvCell(''),
        csvCell(p.name),
        csvCell(''),
        csvCell(''),
      ]);
    }
  }

  for (const b of bundles) {
    const itemsForCsv: ParsedBundleItem[] = [];
    for (const item of b.items) {
      const productName = productNameById.get(item.id);
      if (!productName) continue;
      const variantName = item.variantId ? variantNameById.get(item.variantId) : undefined;
      const entry: ParsedBundleItem = { product: productName, qty: item.quantity };
      if (variantName) entry.variant = variantName;
      itemsForCsv.push(entry);
    }
    rows.push([
      csvCell('bundle'),
      csvCell(b.name),
      csvCell(b.price),
      csvCell(''),
      csvCell(''),
      csvCell(''),
      csvCell(JSON.stringify(itemsForCsv)),
      csvCell(''),
    ]);
  }

  return rows.map((r) => r.join(',')).join('\n');
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      current.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      current.push(field);
      rows.push(current);
      current = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

export function parseCatalog(text: string): ParsedCatalog {
  const rawRows = parseCsvLines(text.trim());
  if (rawRows.length === 0) throw new ParseError('CSV is empty', 1);

  const header = rawRows[0].map((h) => h.trim());
  const expected = [...CATALOG_CSV_HEADER];
  const headerOk =
    header.length === expected.length &&
    header.every((h, idx) => h === expected[idx]);
  if (!headerOk) {
    throw new ParseError(
      `Header must be exactly: ${expected.join(',')}`,
      1
    );
  }

  const products: ParsedProduct[] = [];
  const variants: ParsedVariant[] = [];
  const bundles: ParsedBundle[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (row.length === 1 && row[0] === '') continue;
    if (row.length !== expected.length) {
      throw new ParseError(
        `Expected ${expected.length} columns, got ${row.length}`,
        r + 1
      );
    }
    const [type, name, priceStr, emoji, hasVariantsStr, parentName, bundleJson, imageFilename] =
      row.map((c) => c);

    if (type === 'product') {
      if (!name) throw new ParseError('product row missing name', r + 1);
      const has_variants = hasVariantsStr === '1' ? 1 : 0;
      let price: number | null = null;
      if (!has_variants) {
        if (priceStr === '' || priceStr == null) {
          throw new ParseError('product without variants must have a price', r + 1);
        }
        const n = Number(priceStr);
        if (!Number.isFinite(n)) {
          throw new ParseError(`invalid price "${priceStr}"`, r + 1);
        }
        price = n;
      }
      products.push({
        name,
        price,
        emoji: emoji || '🍬',
        has_variants,
        image_filename: imageFilename ? imageFilename : null,
      });
    } else if (type === 'variant') {
      if (!name) throw new ParseError('variant row missing name', r + 1);
      if (!parentName) {
        throw new ParseError('variant row missing parent_product_name', r + 1);
      }
      const n = Number(priceStr);
      if (!Number.isFinite(n)) {
        throw new ParseError(`invalid variant price "${priceStr}"`, r + 1);
      }
      variants.push({ parent_product_name: parentName, name, price: n });
    } else if (type === 'bundle') {
      if (!name) throw new ParseError('bundle row missing name', r + 1);
      const n = Number(priceStr);
      if (!Number.isFinite(n)) {
        throw new ParseError(`invalid bundle price "${priceStr}"`, r + 1);
      }
      let items: ParsedBundleItem[];
      try {
        items = JSON.parse(bundleJson || '[]') as ParsedBundleItem[];
      } catch {
        throw new ParseError('bundle_items_json is not valid JSON', r + 1);
      }
      if (!Array.isArray(items)) {
        throw new ParseError('bundle_items_json must be a JSON array', r + 1);
      }
      for (const item of items) {
        if (!item || typeof item.product !== 'string' || !item.product) {
          throw new ParseError('bundle item missing product name', r + 1);
        }
        if (typeof item.qty !== 'number' || !Number.isFinite(item.qty) || item.qty <= 0) {
          throw new ParseError(`bundle item has invalid qty for "${item.product}"`, r + 1);
        }
        if (item.variant != null && typeof item.variant !== 'string') {
          throw new ParseError(`bundle item variant must be a string for "${item.product}"`, r + 1);
        }
      }
      bundles.push({ name, price: n, items });
    } else {
      throw new ParseError(`unknown row type "${type}"`, r + 1);
    }
  }

  const productNames = new Set(products.map((p) => p.name));
  for (let i = 0; i < variants.length; i++) {
    if (!productNames.has(variants[i].parent_product_name)) {
      throw new ParseError(
        `variant "${variants[i].name}" references unknown product "${variants[i].parent_product_name}"`,
        -1
      );
    }
  }

  return { products, variants, bundles };
}

export function bundleItemsToInput(
  items: ParsedBundleItem[],
  productNameToId: Map<string, number>,
  variantKeyToId: Map<string, number>
): BundleItemInput[] {
  const out: BundleItemInput[] = [];
  for (const item of items) {
    const productId = productNameToId.get(item.product);
    if (!productId) {
      throw new Error(`bundle references unknown product "${item.product}"`);
    }
    const entry: BundleItemInput = {
      id: productId,
      name: item.product,
      quantity: item.qty,
    };
    if (item.variant) {
      const variantId = variantKeyToId.get(`${productId}::${item.variant}`);
      if (!variantId) {
        throw new Error(
          `bundle references unknown variant "${item.variant}" of product "${item.product}"`
        );
      }
      entry.variantId = variantId;
      entry.variantName = item.variant;
    }
    out.push(entry);
  }
  return out;
}
