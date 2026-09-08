import React, { useEffect, useRef, useState } from 'react';
import {
  View, Animated, PanResponder, ActivityIndicator, Platform, StyleSheet,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

/** Scroll props the wrapped list must spread so we can track the top edge. */
type ScrollProps = {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
};

type Props = {
  /** Run the refresh (e.g. pull Coop's catalog). Awaited; the spinner holds until it resolves. */
  onRefresh: () => Promise<void> | void;
  /** Render the scrollable child, spreading the passed scroll props onto it. */
  children: (scroll: ScrollProps) => React.ReactNode;
};

const RESIST = 0.5; // drag damping — the list follows the finger at half speed
const MAX = 80; // furthest the content travels
const REST = 48; // where the spinner parks while refreshing
const TRIGGER = 50; // pull past this (in travel px) to fire a refresh
const MIN_SPIN_MS = 500; // keep the spinner up long enough to read as a refresh

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull-to-refresh for the product grid. react-native-web ships RefreshControl as
 * a no-op, so this drives the gesture through the Animated + PanResponder
 * responder system, which works with both web touch/mouse and native. The parent
 * captures the gesture only when the list is scrolled to the top and the finger
 * moves down, so normal scrolling and tile taps are untouched.
 */
export function PullToRefresh({ onRefresh, children }: Props) {
  const { colors } = useTheme();
  const pull = useRef(new Animated.Value(0)).current;
  const atTop = useRef(true);
  const busy = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const [refreshing, setRefreshing] = useState(false);

  // Stop the browser's own page-level pull-to-refresh from firing under ours.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = 'contain';
    return () => {
      document.body.style.overscrollBehaviorY = prev;
    };
  }, []);

  const settle = (to: number) =>
    Animated.spring(pull, { toValue: to, useNativeDriver: false, bounciness: 0, speed: 14 }).start();

  const responder = useRef(
    PanResponder.create({
      // Only take over a downward drag that starts at the very top of the list.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        atTop.current && !busy.current && g.dy > 8 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        pull.setValue(Math.min(MAX, Math.max(0, g.dy * RESIST)));
      },
      onPanResponderRelease: async (_, g) => {
        const travel = Math.min(MAX, Math.max(0, g.dy * RESIST));
        if (travel < TRIGGER) {
          settle(0);
          return;
        }
        busy.current = true;
        setRefreshing(true);
        settle(REST);
        try {
          await Promise.all([Promise.resolve(onRefreshRef.current()), delay(MIN_SPIN_MS)]);
        } finally {
          setRefreshing(false);
          busy.current = false;
          settle(0);
        }
      },
      onPanResponderTerminate: () => settle(0),
    }),
  ).current;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTop.current = (e.nativeEvent.contentOffset?.y ?? 0) <= 0;
  };

  const indicatorOpacity = pull.interpolate({
    inputRange: [0, TRIGGER],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container} {...responder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          { height: REST, opacity: refreshing ? 1 : indicatorOpacity, transform: [{ translateY: Animated.subtract(pull, REST) }] },
        ]}
      >
        <ActivityIndicator color={colors.pink} />
      </Animated.View>
      <Animated.View style={[styles.content, { transform: [{ translateY: pull }] }]}>
        {children({ onScroll, scrollEventThrottle: 16 })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  content: { flex: 1 },
});
