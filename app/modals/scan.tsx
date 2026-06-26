import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  SafeAreaView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../../constants/theme';
import { loadClassifier, classifyImage, DetectionResult } from '../../utils/scan-to-cart/classifier';
import { DetectionResultsSheet } from '../../components/DetectionResultsSheet';
import { getProductByName, getVariantByProductIdAndName } from '../../db/products';
import { useCart } from '../../context/CartContext';
import type { ScanLabel } from '../../utils/scan-to-cart/labels';

type Phase = 'loading' | 'permission' | 'capture' | 'detecting' | 'results';

export default function ScanModal() {
  const { addItem } = useCart();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Load the TF.js model on first render
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    loadClassifier()
      .then(() => {
        if (!permission?.granted) {
          setPhase('permission');
        } else {
          setPhase('capture');
        }
      })
      .catch((err) => {
        setLoadError(err.message || 'Model failed to load');
        setPhase('loading');
      });
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (permission?.granted && phase === 'permission') {
      setPhase('capture');
    }
  }, [permission, phase]);

  // Web-only gate — must come AFTER all hooks
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.fallback}>
        <Ionicons name="phone-portrait-outline" size={48} color={C.textMuted} />
        <Text style={styles.fallbackTitle}>Mobile Web Only</Text>
        <Text style={styles.fallbackBody}>
          Open zoomy-pos in your mobile browser (Safari or Chrome) and use{' '}
          <Text style={styles.fallbackBold}>Add to Home Screen</Text> to access product scanning.
        </Text>
      </SafeAreaView>
    );
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    setScanError(null);
    setPhase('detecting');
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.8 });
      setCapturedUri(photo.uri);

      // Draw to canvas for TF.js inference
      const img = document.createElement('img');
      img.src = photo.uri;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load captured image'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 224, 224);

      const detections = await classifyImage(canvas);
      setResults(detections);
      setPhase('results');
    } catch (err) {
      console.error('Scan error:', err);
      setScanError('Scan failed — please try again.');
      setPhase('capture');
    }
  }

  async function handleConfirm(label: ScanLabel, quantity: number) {
    const product = await getProductByName(label.productName);
    if (!product) {
      Alert.alert('Error', `Product "${label.productName}" not found in catalog. Please add it first.`);
      return;
    }
    const variant = await getVariantByProductIdAndName(product.id, label.variantName);
    if (!variant) {
      Alert.alert('Error', `Variant "${label.variantName}" not found for "${label.productName}". Please check the catalog.`);
      return;
    }
    for (let i = 0; i < quantity; i++) {
      addItem({ id: product.id, name: product.name, price: variant.price, variantId: variant.id, variantName: variant.name });
    }
    router.back();
  }

  if (loadError != null) {
    return (
      <SafeAreaView style={styles.fallback}>
        <Ionicons name="warning-outline" size={40} color={C.textMuted} />
        <Text style={styles.fallbackTitle}>Model Unavailable</Text>
        <Text style={styles.fallbackBody}>{loadError}</Text>
      </SafeAreaView>
    );
  }

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={C.pink} />
        <Text style={styles.loadingText}>Loading model…</Text>
      </SafeAreaView>
    );
  }

  if (phase === 'permission') {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={C.textMuted} />
        <Text style={styles.fallbackTitle}>Camera Permission</Text>
        <Text style={styles.fallbackBody}>Camera access is required to scan products.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (phase === 'results' && capturedUri) {
    return (
      <SafeAreaView style={styles.container}>
        <DetectionResultsSheet
          results={results}
          capturedImageUri={capturedUri}
          onConfirm={handleConfirm}
          onScanAgain={() => { setCapturedUri(null); setResults([]); setPhase('capture'); }}
          onClose={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  // capture + detecting phases both show the camera
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <SafeAreaView style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          <View style={styles.viewfinder} />

          <Text style={styles.hint}>
            Point at one product and tap the button
          </Text>

          {scanError != null && (
            <Text style={styles.scanErrorText}>{scanError}</Text>
          )}

          {phase === 'detecting' ? (
            <View style={styles.captureArea}>
              <ActivityIndicator size="large" color={C.pink} />
              <Text style={styles.detectingText}>Identifying…</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.captureBtn} onPress={handleCapture}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  viewfinder: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: R.lg,
    backgroundColor: 'transparent',
  },
  hint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: F.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  captureArea: { alignItems: 'center', gap: 10 },
  detectingText: { color: '#fff', fontSize: F.sm, fontWeight: '700' },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  loadingText: { color: C.textMuted, fontSize: F.sm },
  scanErrorText: { color: C.textMuted, fontSize: F.xs, textAlign: 'center' },
  fallback: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  fallbackTitle: { color: C.textPrimary, fontSize: F.lg, fontWeight: '800', textAlign: 'center' },
  fallbackBody: { color: C.textMuted, fontSize: F.sm, textAlign: 'center', lineHeight: 20 },
  fallbackBold: { color: C.textSecondary, fontWeight: '700' },
  permissionBtn: {
    backgroundColor: C.pink,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: R.sm,
    marginTop: 8,
  },
  permissionBtnText: { color: '#fff', fontWeight: '800', fontSize: F.md },
});
