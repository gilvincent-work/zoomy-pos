import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { promptInstall } from '../utils/pwa';
import { formatRelativeTime } from '../utils/format-relative-time';
import { drainOutbox } from '../utils/outbox';

/**
 * Always-visible "last synced · N pending" marker (see COOP_INTEGRATION_PLAN.md,
 * "Sync transparency"), plus an "Install" affordance when the browser offers a
 * PWA install prompt. Tapping the marker triggers a manual drain of the outbox
 * (a no-op when nothing is pending). Reads the sync-status store, so it updates
 * on its own as that store changes.
 */
export function SyncStatusBar() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lastSyncedAt, pendingCount, syncing } = useSyncStatus();
  const canInstall = useInstallPrompt();

  // Re-render every 30s so the relative time ("3m ago") stays fresh while idle.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const synced = pendingCount === 0 && !syncing;
  const dotColor = syncing ? colors.textSecondary : pendingCount > 0 ? colors.pink : colors.green;
  const syncNow = () => { if (!syncing) drainOutbox().catch(() => {}); };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.marker}
        onPress={syncNow}
        disabled={syncing}
        accessibilityRole="button"
        accessibilityLabel={pendingCount > 0 ? `Sync ${pendingCount} pending now` : 'Sync now'}
      >
        {syncing ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
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
          <Ionicons name="checkmark-circle" size={13} color={colors.green} />
        )}
      </TouchableOpacity>

      {canInstall && (
        <TouchableOpacity
          onPress={promptInstall}
          style={styles.installBtn}
          accessibilityRole="button"
          accessibilityLabel="Install app"
        >
          <Ionicons name="download-outline" size={13} color={colors.pink} />
          <Text style={styles.installText}>Install</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: c.textSecondary, fontSize: F.xs, fontWeight: '600' },
  pendingPill: {
    backgroundColor: c.pinkSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingText: { color: c.pink, fontSize: F.xs, fontWeight: '700' },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: c.pink,
    borderRadius: R.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  installText: { color: c.pink, fontSize: F.xs, fontWeight: '700' },
});
