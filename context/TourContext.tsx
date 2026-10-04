import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { getActivePickBundles } from '../db/saved-bundles';
import type { TourRect, TourScene, TourStatus, TourStep } from '../components/tour/types';

// The tour drives the real app: for each step it sets a scene (screens apply it),
// moves to the step's route, then waits for the step's target to be measurable.
// A target that never appears skips the step instead of leaving the tour stuck.

export type MeasureFn = () => Promise<TourRect | null>;

type TourContextValue = {
  /** True while the tour is running. Write handlers use this to stay read-only. */
  active: boolean;
  index: number;
  total: number;
  step: TourStep | null;
  scene: TourScene | null;
  rect: TourRect | null;
  status: TourStatus;
  start: () => void;
  next: () => void;
  back: () => void;
  stop: () => void;
  registerTarget: (id: string, measure: MeasureFn) => () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}

/** The scene screens should apply, or null when no tour is running. */
export function useTourScene(): TourScene | null {
  return useTour().scene;
}

const HOME = '/';
const TARGET_TIMEOUT_MS = 2000;
const TARGET_POLL_MS = 120;
const SCENE_SETTLE_MS = 350;
const NAV_BACK_MS = 450;
const NAV_PUSH_MS = 550;
const REMEASURE_MS = 150;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Props = {
  steps: TourStep[];
  /** Runs once whenever a tour ends, by Done, Skip, back, or backgrounding. */
  onStop?: () => void;
  children: React.ReactNode;
};

export function TourProvider({ steps, onStop, children }: Props) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [scene, setScene] = useState<TourScene | null>(null);
  const [rect, setRect] = useState<TourRect | null>(null);
  const [status, setStatus] = useState<TourStatus>('idle');

  const targets = useRef(new Map<string, MeasureFn>());
  const routeRef = useRef(HOME);
  const sceneKeyRef = useRef('');
  const directionRef = useRef<1 | -1>(1);
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const registerTarget = useCallback((id: string, measure: MeasureFn) => {
    targets.current.set(id, measure);
    return () => {
      if (targets.current.get(id) === measure) targets.current.delete(id);
    };
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    setStatus('idle');
    setScene(null);
    setRect(null);
    setIndex(0);
    sceneKeyRef.current = '';
    if (routeRef.current !== HOME) {
      router.back();
      routeRef.current = HOME;
    }
    onStopRef.current?.();
  }, []);

  const start = useCallback(() => {
    directionRef.current = 1;
    sceneKeyRef.current = '';
    setIndex(0);
    setRect(null);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    directionRef.current = 1;
    if (index >= steps.length - 1) stop();
    else setIndex(index + 1);
  }, [index, steps.length, stop]);

  const back = useCallback(() => {
    directionRef.current = -1;
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Backgrounding the app ends the tour so nothing is left half-open.
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') stop();
    });
    return () => sub.remove();
  }, [active, stop]);

  // Run the current step: scene, navigation, then wait for the target.
  useEffect(() => {
    if (!active) return;
    const step = steps[index];
    if (!step) return;
    let cancelled = false;

    // Skip over a step that cannot be shown, in the direction the user was going.
    const skip = () => {
      if (cancelled) return;
      const dir = directionRef.current;
      const nextIndex = index + dir;
      if (nextIndex < 0) setIndex(0);
      else if (nextIndex >= steps.length) stop();
      else setIndex(nextIndex);
    };

    async function waitForTarget(id: string): Promise<TourRect | null> {
      const deadline = Date.now() + TARGET_TIMEOUT_MS;
      while (!cancelled && Date.now() < deadline) {
        const found = await targets.current.get(id)?.();
        if (found) {
          await sleep(REMEASURE_MS);
          // A second read picks up the final position after any slide-in.
          return (await targets.current.get(id)?.()) ?? found;
        }
        await sleep(TARGET_POLL_MS);
      }
      return null;
    }

    async function resolveRoute(route: string): Promise<string | null> {
      if (!route.includes(':firstBundleId')) return route;
      const bundles = await getActivePickBundles();
      return bundles.length > 0 ? route.replace(':firstBundleId', String(bundles[0].id)) : null;
    }

    (async () => {
      const route = await resolveRoute(step.route);
      if (cancelled) return;
      if (route === null) return skip();

      // Same screen and same scene: keep the spotlight on screen and just glide
      // it to the next target, with no settle delay and no flicker.
      const sceneKey = JSON.stringify(step.scene ?? {});
      const sameStage = route === routeRef.current && sceneKey === sceneKeyRef.current;
      sceneKeyRef.current = sceneKey;

      if (!sameStage) {
        setRect(null);
        setStatus('navigating');
        // Apply the scene first so sheets from the previous step close before we navigate.
        setScene(step.scene ?? {});
        await sleep(SCENE_SETTLE_MS);
        if (cancelled) return;
        if (route !== routeRef.current) {
          if (routeRef.current !== HOME) {
            router.back();
            routeRef.current = HOME;
            await sleep(NAV_BACK_MS);
          }
          if (route !== HOME) {
            router.push(route as never);
            routeRef.current = route;
            await sleep(NAV_PUSH_MS);
          }
          if (cancelled) return;
        }
      }

      if (step.target === null) {
        setStatus('ready');
        return;
      }
      const found = await waitForTarget(step.target);
      if (cancelled) return;
      if (!found) return skip();
      setRect(found);
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [active, index, steps, stop]);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      index,
      total: steps.length,
      step: active ? steps[index] ?? null : null,
      scene,
      rect,
      status,
      start,
      next,
      back,
      stop,
      registerTarget,
    }),
    [active, index, steps, scene, rect, status, start, next, back, stop, registerTarget]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
