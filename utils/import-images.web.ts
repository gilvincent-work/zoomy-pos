import type JSZip from 'jszip';

export type ResolveImage = (
  filename: string,
  productName: string
) => Promise<string | null>;

export function makeImageResolver(zip: JSZip): ResolveImage {
  return async (filename, _productName) => {
    const entry = zip.file(filename);
    if (!entry) return null;
    const blob = await entry.async('blob');
    return URL.createObjectURL(blob);
  };
}
