import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { CartProvider } from '../context/CartContext';
import { initSchema } from '../db/schema';
import { seedDevProducts, seedProductsIfEmpty, seedBundlesIfEmpty, syncLinePricesOnce, syncCatalogNamesOnce } from '../db/seed';
import { C } from '../constants/theme';
import { ToastProvider } from '../components/Toast';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      await initSchema();
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
      setReady(true);
    }
    bootstrap();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.pink} size="large" />
      </View>
    );
  }

  return (
    <ToastProvider>
      <CartProvider>
        <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.textPrimary }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="modals/payment" options={{ presentation: 'modal', title: 'Payment' }} />
          <Stack.Screen name="modals/products" options={{ presentation: 'modal', title: 'Products' }} />
          <Stack.Screen name="modals/transactions" options={{ presentation: 'modal', title: 'Transactions' }} />
          <Stack.Screen name="modals/admin" options={{ presentation: 'modal', title: '' }} />
          <Stack.Screen name="modals/bundle" options={{ presentation: 'modal', title: 'Add Bundle' }} />
          <Stack.Screen name="modals/bundle-select" options={{ presentation: 'modal', title: 'Choose Flavors' }} />
          <Stack.Screen name="modals/scan"   options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      </CartProvider>
    </ToastProvider>
  );
}
