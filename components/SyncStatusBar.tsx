import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { promptInstall } from '../utils/pwa';
import { formatRelativeTime } from '../utils/format-relative-time';

/**
 * Always-visible "last synced · N pending" marker (see COOP_INTEGRATION_PLAN.md,
 * "Sync transparency"), plus an "Install" affordance when the browser offers a
 * PWA install prompt. Phase 1 shows sync state; the manual "Sync now" action and
 * live pending counts arrive with the Phase 2 outbox. Reads the sync-status
 * store, so it updates on its own as that store changes.
 */
export function SyncStatusBar() {
  const { lastSyncedAt, pendingCount, syncing } = useSyncStatus();
  const canInstall = useInstallPrompt();

  // Re-render every 30s so the relative time ("3m ago") stays fresh while idle.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const synced = pendingCount === 0 && !syncing;
  const dotColor = syncing ? C.textSecondary : pendingCount > 0 ? C.pink : C.green;

  return (
    <View style={styles.row}>
      <View style={styles.marker} accessibilityRole="text">
        {syncing ? (
          <ActivityIndicator size="small" color={C.textSecondary} />
        ) : (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        )}
        <Text style={styles.label} numberOfLines={1}>
          {syncing ? 'Syncing…' : `Synced ${formatRelativeTime(lastSyncedAt)}`}
        </Text>
        {pendingCount > 0 && !syncing && (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingText}>{pendingCount} pending</Text>
          </View>
        )}
        {synced && !syncing && (
          <Ionicons name="checkmark-circle" size={13} color={C.green} />
        )}
      </View>

      {canInstall && (
        <TouchableOpacity
          onPress={promptInstall}
          style={styles.installBtn}
          accessibilityRole="button"
          accessibilityLabel="Install app"
        >
          <Ionicons name="download-outline" size={13} color={C.pink} />
          <Text style={styles.installText}>Install</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: C.textSecondary, fontSize: F.xs, fontWeight: '600' },
  pendingPill: {
    backgroundColor: C.pinkSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingText: { color: C.pink, fontSize: F.xs, fontWeight: '700' },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: C.pink,
    borderRadius: R.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  installText: { color: C.pink, fontSize: F.xs, fontWeight: '700' },
});
