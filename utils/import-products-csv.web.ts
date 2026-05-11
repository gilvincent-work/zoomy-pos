import JSZip from 'jszip';
import { CATALOG_CSV_NAME } from './products-csv-format';

export type PickedArchive = { csvText: string; zip: JSZip };

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('Failed to read file as ArrayBuffer'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export async function pickProductsZip(): Promise<PickedArchive | null> {
  const file = await new Promise<File | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.style.display = 'none';

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = () => {
      settled = true;
      cleanup();
      resolve(input.files?.[0] ?? null);
    };

    const handleFocus = () => {
      window.removeEventListener('focus', handleFocus);
      setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve(null);
        }
      }, 500);
    };
    window.addEventListener('focus', handleFocus);

    input.onerror = () => {
      cleanup();
      reject(new Error('File input error'));
    };

    document.body.appendChild(input);
    input.click();
  });

  if (!file) return null;

  const buffer = await readAsArrayBuffer(file);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
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
