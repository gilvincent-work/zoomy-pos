import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R } from '../constants/theme';

export type ToastVariant = 'success' | 'error';

export type ToastInput = {
  variant: ToastVariant;
  title: string;
  message?: string;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

type VisibleToast = ToastInput & { id: number };

const SUCCESS_DURATION_MS = 3000;
const ERROR_DURATION_MS = 5000;
const ANIM_DURATION_MS = 180;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<VisibleToast | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: ANIM_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [progress]);

  const showToast = useCallback(
    (input: ToastInput) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      progress.setValue(0);
      const id = ++nextId.current;
      setToast({ ...input, id });
      Animated.timing(progress, {
        toValue: 1,
        duration: ANIM_DURATION_MS,
        useNativeDriver: true,
      }).start();
      const duration =
        input.variant === 'error' ? ERROR_DURATION_MS : SUCCESS_DURATION_MS;
      hideTimer.current = setTimeout(() => {
        dismiss();
      }, duration);
    },
    [progress, dismiss]
  );

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const ctxValue = useMemo(() => ({ showToast }), [showToast]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-16, 0],
  });
  const opacity = progress;

  const isError = toast?.variant === 'error';
  const accent = isError ? C.red : C.green;
  const iconName = isError ? 'alert-circle' : 'checkmark-circle';

  return (
    <ToastContext.Provider value={ctxValue}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.host, { paddingTop: insets.top + 12 }]}
      >
        {toast ? (
          <Animated.View
            style={[
              styles.toast,
              { borderColor: accent, opacity, transform: [{ translateY }] },
            ]}
          >
            <Pressable onPress={dismiss} style={styles.toastInner}>
              <Ionicons name={iconName} size={22} color={accent} />
              <View style={styles.toastText}>
                <Text style={styles.title} numberOfLines={1}>
                  {toast.title}
                </Text>
                {toast.message ? (
                  <Text style={styles.message} numberOfLines={4}>
                    {toast.message}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    minWidth: 260,
    maxWidth: 480,
    backgroundColor: C.elevated,
    borderRadius: R.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  toastText: {
    flex: 1,
  },
  title: {
    color: C.textPrimary,
    fontSize: F.md,
    fontWeight: '700',
  },
  message: {
    color: C.textSecondary,
    fontSize: F.sm,
    marginTop: 2,
    lineHeight: 18,
  },
});
