import { useSyncExternalStore } from 'react';
import { canInstall, subscribeInstall } from '../utils/pwa';

/**
 * Whether a PWA install prompt is currently available. Always false on native
 * and on browsers/sessions where the app is already installed.
 */
export function useInstallPrompt(): boolean {
  return useSyncExternalStore(subscribeInstall, canInstall, canInstall);
}
