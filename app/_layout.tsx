import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { CartProvider } from '../context/CartContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { initSchema } from '../db/schema';
import { seedDevProducts, seedProductsIfEmpty, seedBundlesIfEmpty, syncLinePricesOnce, syncCatalogNamesOnce, syncCatalogSkusOnce } from '../db/seed';
import { palettes, type ThemeMode } from '../constants/theme';
import { ToastProvider } from '../components/Toast';
import { requestPersistentStorage } from '../utils/pwa';
import { loadPersistedSyncStatus } from '../utils/sync-status';
import { loadThemeMode } from '../utils/theme-preference';
import { pullCatalog } from '../utils/catalog-sync';

/** The navigator, themed from context so headers and status bar track the toggle. */
function ThemedStack() {
  const { mode, colors } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.textPrimary }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="modals/payment" options={{ presentation: 'modal', title: 'Payment' }} />
        <Stack.Screen name="modals/products" options={{ presentation: 'modal', title: 'Products' }} />
        <Stack.Screen name="modals/transactions" options={{ presentation: 'modal', title: 'Transactions' }} />
        <Stack.Screen name="modals/admin" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="modals/bundle" options={{ presentation: 'modal', title: 'Add Bundle' }} />
        <Stack.Screen name="modals/bundle-select" options={{ presentation: 'modal', title: 'Choose Flavors' }} />
        <Stack.Screen name="modals/scan"   options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // Default dark; the persisted choice (if any) is loaded before the UI mounts.
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    async function bootstrap() {
      await initSchema();
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
    }
    bootstrap();

    // Re-pull when connectivity returns (web PWA). Native falls back to the
    // launch pull; a NetInfo trigger can be added later if needed.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onOnline = () => { pullCatalog().catch(() => {}); };
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }
  }, []);

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
