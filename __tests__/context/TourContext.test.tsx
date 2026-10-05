import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { TourProvider, useTour } from '../../context/TourContext';
import type { TourStep } from '../../components/tour/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../db/saved-bundles', () => ({ getActivePickBundles: jest.fn() }));

const { getActivePickBundles } = jest.requireMock('../../db/saved-bundles') as {
  getActivePickBundles: jest.Mock;
};

const RECT = { x: 10, y: 20, width: 100, height: 40 };

const step = (id: string, over: Partial<TourStep> = {}): TourStep => ({
  id, route: '/', target: id, title: id, body: id, ...over,
});

let tour: ReturnType<typeof useTour>;

/** Captures the tour value and registers fake measurable targets. */
function Harness({ present }: { present: string[] }) {
  const t = useTour();
  tour = t;
  useEffect(() => {
    const offs = present.map((id) => t.registerTarget(id, async () => RECT));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present.join(',')]);
  return null;
}

function setup(steps: TourStep[], present: string[], onStop?: () => void) {
  render(
    <TourProvider steps={steps} onStop={onStop}>
      <Harness present={present} />
    </TourProvider>
  );
}

const settle = (ms = 3000) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

describe('TourProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getActivePickBundles.mockResolvedValue([]);
  });
  afterEach(() => jest.useRealTimers());

  it('starts on the first step and reports ready once its target is measured', async () => {
    setup([step('a'), step('b')], ['a', 'b']);
    expect(tour.active).toBe(false);

    act(() => tour.start());
    expect(tour.active).toBe(true);
    expect(tour.step?.id).toBe('a');

    await settle();
    expect(tour.status).toBe('ready');
    expect(tour.rect).toEqual(RECT);
  });

  it('moves with next and back', async () => {
    setup([step('a'), step('b'), step('c')], ['a', 'b', 'c']);
    act(() => tour.start());
    await settle();

    act(() => tour.next());
    await settle();
    expect(tour.step?.id).toBe('b');

    act(() => tour.back());
    await settle();
    expect(tour.step?.id).toBe('a');
  });

  it('ends the tour and calls onStop when Next is pressed on the last step', async () => {
    const onStop = jest.fn();
    setup([step('a')], ['a'], onStop);
    act(() => tour.start());
    await settle();

    act(() => tour.next());
    expect(tour.active).toBe(false);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('skips a step whose target never appears', async () => {
    setup([step('a'), step('missing'), step('c')], ['a', 'c']);
    act(() => tour.start());
    await settle();

    act(() => tour.next());
    await settle(6000);
    expect(tour.step?.id).toBe('c');
  });

  it('skips backward over a missing step when going back', async () => {
    setup([step('a'), step('missing'), step('c')], ['a', 'c']);
    act(() => tour.start());
    await settle();
    act(() => tour.next());
    await settle(6000);
    expect(tour.step?.id).toBe('c');

    act(() => tour.back());
    await settle(6000);
    expect(tour.step?.id).toBe('a');
  });

  it('pushes a modal route for a step that lives on another screen and backs out on stop', async () => {
    setup([step('a'), step('m', { route: '/modals/products' })], ['a', 'm']);
    act(() => tour.start());
    await settle();

    act(() => tour.next());
    await settle();
    expect(router.push).toHaveBeenCalledWith('/modals/products');

    act(() => tour.stop());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(tour.active).toBe(false);
  });

  it('returns home between two modal steps before pushing the second', async () => {
    setup(
      [step('m1', { route: '/modals/free-taste' }), step('m2', { route: '/modals/bundle' })],
      ['m1', 'm2']
    );
    act(() => tour.start());
    await settle();
    act(() => tour.next());
    await settle();

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenLastCalledWith('/modals/bundle');
  });

  it('resolves :firstBundleId and skips the step when there is no bundle', async () => {
    const steps = [step('a'), step('b', { route: '/modals/bundle-select?bundleId=:firstBundleId' }), step('c')];

    getActivePickBundles.mockResolvedValue([{ id: 7 }]);
    setup(steps, ['a', 'b', 'c']);
    act(() => tour.start());
    await settle();
    act(() => tour.next());
    await settle();
    expect(router.push).toHaveBeenCalledWith('/modals/bundle-select?bundleId=7');
  });

  it('skips the bundle step when no bundle exists', async () => {
    getActivePickBundles.mockResolvedValue([]);
    setup(
      [step('a'), step('b', { route: '/modals/bundle-select?bundleId=:firstBundleId' }), step('c')],
      ['a', 'b', 'c']
    );
    act(() => tour.start());
    await settle();
    act(() => tour.next());
    await settle();
    expect(router.push).not.toHaveBeenCalled();
    expect(tour.step?.id).toBe('c');
  });

  it('uses the first target in a list that is on screen', async () => {
    setup([step('a', { target: ['peek-bar', 'side-cart'] })], ['side-cart']);
    act(() => tour.start());
    await settle();
    expect(tour.status).toBe('ready');
    expect(tour.rect).toEqual(RECT);
  });

  it('bumps epoch when a new scene settles but not for a step on the same stage', async () => {
    setup(
      [step('a', { scene: { sheet: 'free-taste' } }), step('b', { scene: { sheet: 'free-taste' } }), step('c', { scene: { cartExpanded: true } })],
      ['a', 'b', 'c']
    );
    act(() => tour.start());
    await settle();
    const afterFirst = tour.epoch;
    expect(afterFirst).toBeGreaterThan(0);

    act(() => tour.next());
    await settle();
    expect(tour.epoch).toBe(afterFirst);

    act(() => tour.next());
    await settle();
    expect(tour.epoch).toBe(afterFirst + 1);
  });

  it('applies a step scene and clears it when the tour stops', async () => {
    setup([step('a', { scene: { cartExpanded: true } })], ['a']);
    act(() => tour.start());
    await settle();
    expect(tour.scene).toEqual({ cartExpanded: true });

    act(() => tour.stop());
    expect(tour.scene).toBeNull();
  });
});
