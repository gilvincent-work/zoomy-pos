import type JSZip from 'jszip';

export type ResolveImage = (
  filename: string,
  productName: string
) => Promise<string | null>;

export function makeImageResolver(zip: JSZip): ResolveImage {
  return async (filename, _productName) => {
    const entry = zip.file(filename);
    if (!entry) return null;
    const base64 = await entry.async('base64');
    return `data:${mimeFor(filename)};base64,${base64}`;
  };
}

function mimeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
