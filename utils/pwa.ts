/**
 * PWA storage-durability + install-prompt helpers. Native stub: on iOS/Android
 * there is no browser storage to persist and no install banner, so these are
 * no-ops. The real behavior lives in pwa.web.ts. See COOP_INTEGRATION_PLAN.md
 * ("PWA durability across app close").
 */

/** Ask the browser to keep our IndexedDB/SQLite data from being evicted. No-op off web. */
export async function requestPersistentStorage(): Promise<boolean> {
  return false;
}

/** Whether an install prompt is currently available. Always false off web. */
export function canInstall(): boolean {
  return false;
}

/** Trigger the captured install prompt. No-op off web. */
export async function promptInstall(): Promise<void> {}

/** Subscribe to install-availability changes. No-op off web; returns an unsubscribe. */
export function subscribeInstall(_listener: () => void): () => void {
  return () => {};
}
