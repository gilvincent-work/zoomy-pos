import JSZip from 'jszip';
import { processCSV, ImportResult } from './import-csv-parser';

export async function importTransactionsZip(): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
    };

    // Detect cancel: window refocuses after picker closes with no selection
    const onWindowFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) {
          cleanup();
          window.removeEventListener('focus', onWindowFocus);
          resolve({ imported: 0, skipped: 0, failed: 0, photosMissing: 0 });
        }
      }, 500);
    };
    window.addEventListener('focus', onWindowFocus);

    input.onchange = async () => {
      window.removeEventListener('focus', onWindowFocus);
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve({ imported: 0, skipped: 0, failed: 0, photosMissing: 0 });
        return;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const csvFile = zip.file('transactions.csv');
        if (!csvFile) throw new Error('transactions.csv not found in this file.');
        const csvText = await csvFile.async('string');
        resolve(await processCSV(csvText, zip));
      } catch (err) {
        reject(err);
      }
    };

    input.click();
  });
}
