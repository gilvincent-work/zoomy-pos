export async function pickProductsCsv(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.style.display = 'none';

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        settled = true;
        cleanup();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        settled = true;
        cleanup();
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => {
        settled = true;
        cleanup();
        reject(reader.error ?? new Error('Failed to read file'));
      };
      reader.readAsText(file);
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

    document.body.appendChild(input);
    input.click();
  });
}
