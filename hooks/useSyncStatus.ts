import { useSyncExternalStore } from 'react';
import { getSyncState, subscribeSyncStatus, SyncState } from '../utils/sync-status';

/** Subscribe a component to the sync-status store (see utils/sync-status.ts). */
export function useSyncStatus(): SyncState {
  return useSyncExternalStore(subscribeSyncStatus, getSyncState, getSyncState);
}
