/**
 * PWA storage-durability + install-prompt helpers (web). See
 * COOP_INTEGRATION_PLAN.md ("PWA durability across app close"):
 *  - navigator.storage.persist() so the browser won't evict unsynced sales
 *    under storage pressure.
 *  - capture beforeinstallprompt so we can offer "Add to Home Screen"
 *    (installed PWAs retain storage far better than plain tabs).
 */

// The beforeinstallprompt event isn't in the DOM lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

// Capture the event at module load (fires early, before React may be ready).
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // stop Chrome's mini-infobar; we drive the prompt ourselves
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    // Already granted? persisted() avoids a redundant prompt/telemetry hit.
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<void> {
  const prompt = deferredPrompt;
  if (!prompt) return;
  // A prompt can only be used once; clear it before awaiting the choice.
  deferredPrompt = null;
  notify();
  await prompt.prompt();
  await prompt.userChoice;
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
