import React, { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { CartProvider } from '../context/CartContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { initSchema } from '../db/schema';
import { seedDevProducts, seedProductsIfEmpty, seedBundlesIfEmpty, syncLinePricesOnce, syncCatalogNamesOnce, syncCatalogSkusOnce, syncCatalogEmojiOnce } from '../db/seed';
import { palettes, type ThemeMode } from '../constants/theme';
import { ToastProvider } from '../components/Toast';
import { requestPersistentStorage } from '../utils/pwa';
import { loadPersistedSyncStatus } from '../utils/sync-status';
import { loadThemeMode } from '../utils/theme-preference';
import { pullCatalog } from '../utils/catalog-sync';

// Anchor the stack to the POS home. Without this, deep-linking or reloading the
// PWA directly on a modal route (e.g. /modals/transactions) opens that modal
// with no screen beneath it — so its header back button vanishes and Back can't
// return to the POS. The anchor guarantees `index` always sits under the modals.
export const unstable_settings = { anchor: 'index' };

/** The navigator, themed from context so headers and status bar track the toggle. */
function ThemedStack() {
  const { mode, colors } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.textPrimary }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="modals/products" options={{ presentation: 'modal', title: 'Products' }} />
        <Stack.Screen name="modals/transactions" options={{ presentation: 'modal', title: 'Transactions' }} />
        <Stack.Screen name="modals/admin" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="modals/payment-settings" options={{ presentation: 'modal', title: 'Payment Options' }} />
        <Stack.Screen name="modals/bundle" options={{ presentation: 'modal', title: 'Add Bundle' }} />
        <Stack.Screen name="modals/bundle-select" options={{ presentation: 'modal', title: 'Choose Flavors' }} />
        <Stack.Screen name="modals/scan"   options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </>
  );
}

/** Reject if a promise takes longer than `ms` (guards a stuck web SQLite open). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Default dark; the persisted choice (if any) is loaded before the UI mounts.
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  const bootstrap = useCallback(async () => {
    setFailed(false);
    try {
      // initSchema opens the web SQLite DB (wa-sqlite / OPFS), whose exclusive
      // access handle can transiently fail to acquire right after a reload.
      // Retry a few times with backoff + a timeout so a stuck/locked open
      // recovers on its own instead of hanging the splash until a manual refresh.
      let lastErr: unknown;
      let ok = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await withTimeout(initSchema(), 8000, 'Database open');
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          await sleep(300 * (attempt + 1));
        }
      }
      if (!ok) throw lastErr;

      // Ask the browser to keep unsynced sales from being evicted under storage
      // pressure (web only; no-op on native). See COOP_INTEGRATION_PLAN.md.
      await requestPersistentStorage();
      // Dev refreshes the sample catalog on every version bump (destructive);
      // staging/production seed the starter catalog only when empty. Temporary
      // until products are sourced from Shopify.
      if (__DEV__) {
        await seedDevProducts();
      } else {
        await seedProductsIfEmpty();
        await seedBundlesIfEmpty();
      }
      // One-time corrections for installs seeded before these changes.
      await syncLinePricesOnce();
      await syncCatalogNamesOnce();
      await syncCatalogSkusOnce();
      await syncCatalogEmojiOnce();
      // Hydrate the "last synced" marker from the persisted timestamp.
      await loadPersistedSyncStatus();
      // Restore the saved dark/light choice before the first paint so the theme
      // does not flash from the default on launch.
      const savedMode = await loadThemeMode();
      if (savedMode) setThemeMode(savedMode);
      setReady(true);
      // Pull Coop's latest price/listing into the local cache (online-only;
      // no-op offline/unconfigured). Non-blocking so launch isn't gated on the
      // network; open screens refresh via the catalog-changed subscription.
      pullCatalog().catch(() => {});
    } catch {
      // Never leave the splash spinning forever: surface a retry instead.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    bootstrap();

    // Re-pull when connectivity returns (web PWA). Native falls back to the
    // launch pull; a NetInfo trigger can be added later if needed.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onOnline = () => { pullCatalog().catch(() => {}); };
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }
  }, [bootstrap]);

  if (failed) {
    const c = palettes[themeMode];
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: c.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>Couldn’t start</Text>
        <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20, maxWidth: 320 }}>
          The local store didn’t open. This can happen on the first load or with the app open in another tab.
        </Text>
        <Pressable
          onPress={() => { setReady(false); bootstrap(); }}
          style={{ backgroundColor: c.pink, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: palettes[themeMode].bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palettes[themeMode].pink} size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider initialMode={themeMode}>
      <ToastProvider>
        <CartProvider>
          <ThemedStack />
        </CartProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
