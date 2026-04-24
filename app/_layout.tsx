import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { CartProvider } from '../context/CartContext';
import { initSchema } from '../db/schema';
import { C } from '../constants/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initSchema().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.pink} size="large" />
      </View>
    );
  }

  return (
    <CartProvider>
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.textPrimary }}>
        <Stack.Screen name="index" options={{ title: 'ZoomyPOS' }} />
        <Stack.Screen name="modals/payment" options={{ presentation: 'modal', title: 'Payment' }} />
        <Stack.Screen name="modals/products" options={{ presentation: 'modal', title: 'Products' }} />
        <Stack.Screen name="modals/transactions" options={{ presentation: 'modal', title: 'Transactions' }} />
        <Stack.Screen name="modals/admin" options={{ presentation: 'modal', title: '' }} />
      </Stack>
    </CartProvider>
  );
}
