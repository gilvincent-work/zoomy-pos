import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AccessibilityInfo, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTour } from '../../context/TourContext';
import { R } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { TourTooltip } from './TourTooltip';

const SCRIM = 'rgba(0,0,0,0.72)';
const PAD = 6;
const GAP = 12;
const TWEEN_MS = 260;
const MARGIN = 16;
const MAX_CARD_WIDTH = 460;

/**
 * Dims the screen except for the current step's target and shows its card.
 * Rendered in a transparent Modal so it sits above the app's own modal screens.
 * The Modal is keyed by route + scene so it re-presents after a sheet or drawer
 * opens and stays on top of it.
 */
export function TourOverlay() {
  const { active, step, scene, rect, status, index, total, next, back, stop } = useTour();
  const { colors } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const h = useRef(new Animated.Value(0)).current;
  const hadRect = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!rect) {
      hadRect.current = false;
      return;
    }
    const to = { x: rect.x - PAD, y: rect.y - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 };
    if (!hadRect.current || reduceMotion) {
      x.setValue(to.x); y.setValue(to.y); w.setValue(to.w); h.setValue(to.h);
      hadRect.current = true;
      return;
    }
    Animated.parallel(
      [[x, to.x], [y, to.y], [w, to.w], [h, to.h]].map(([v, val]) =>
        Animated.timing(v as Animated.Value, { toValue: val as number, duration: TWEEN_MS, useNativeDriver: false })
      )
    ).start();
  }, [rect, reduceMotion, x, y, w, h]);

  const overlayKey = `${step?.route ?? ''}|${JSON.stringify(scene ?? {})}`;
  const showHole = status === 'ready' && rect !== null;

  // Card goes on whichever side of the target has more room.
  const cardPlacement = useMemo(() => {
    if (!showHole || !rect) return { top: Math.round(H * 0.3) };
    const above = rect.y - PAD;
    const below = H - (rect.y + rect.height + PAD);
    return above > below
      ? { bottom: H - rect.y + PAD + GAP }
      : { top: rect.y + rect.height + PAD + GAP };
  }, [showHole, rect, H]);

  if (!active || !step) return null;

  const bottomEdge = Animated.add(y, h);
  const rightEdge = Animated.add(x, w);

  return (
    <Modal
      key={overlayKey}
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={stop}
    >
      <View style={styles.fill} testID="tour-overlay">
        {showHole ? (
          <>
            <Animated.View style={[styles.dim, { left: 0, right: 0, top: 0, height: y }]} />
            <Animated.View style={[styles.dim, { left: 0, right: 0, top: bottomEdge, bottom: 0 }]} />
            <Animated.View style={[styles.dim, { left: 0, top: y, width: x, height: h }]} />
            <Animated.View style={[styles.dim, { left: rightEdge, right: 0, top: y, height: h }]} />
            <Animated.View
              pointerEvents="none"
              style={[styles.ring, { left: x, top: y, width: w, height: h, borderColor: colors.pink }]}
            />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}
        {status === 'ready' && (
          <View style={[styles.cardWrap, cardPlacement, { width: Math.min(W - MARGIN * 2, MAX_CARD_WIDTH) }]}>
            <TourTooltip step={step} index={index} total={total} onBack={back} onNext={next} onSkip={stop} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dim: { position: 'absolute', backgroundColor: SCRIM },
  ring: { position: 'absolute', borderWidth: 2, borderRadius: R.md },
  cardWrap: { position: 'absolute', alignSelf: 'center' },
});
