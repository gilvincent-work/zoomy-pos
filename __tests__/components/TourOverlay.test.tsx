import React, { useEffect } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { TourProvider, useTour } from '../../context/TourContext';
import { TourOverlay } from '../../components/tour/TourOverlay';
import type { TourStep } from '../../components/tour/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../db/saved-bundles', () => ({ getActivePickBundles: jest.fn().mockResolvedValue([]) }));

const steps: TourStep[] = [
  { id: 'a', route: '/', target: 'a', title: 'First card', body: 'About the first thing.' },
  { id: 'b', route: '/', target: 'b', title: 'Second card', body: 'About the second thing.' },
];

let tour: ReturnType<typeof useTour>;

function Harness() {
  const t = useTour();
  tour = t;
  useEffect(() => {
    const offs = ['a', 'b'].map((id) =>
      t.registerTarget(id, async () => ({ x: 20, y: 100, width: 80, height: 40 }))
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <TourOverlay />;
}

const settle = () => act(async () => { await jest.advanceTimersByTimeAsync(3000); });

describe('TourOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders nothing until the tour starts', () => {
    const { queryByTestId } = render(<TourProvider steps={steps}><Harness /></TourProvider>);
    expect(queryByTestId('tour-overlay')).toBeNull();
  });

  it('shows the step card with Skip on the first step, then Back and Done on the last', async () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <TourProvider steps={steps}><Harness /></TourProvider>
    );
    act(() => tour.start());
    await settle();

    expect(getByText('First card')).toBeTruthy();
    expect(getByText('1 of 2')).toBeTruthy();
    expect(getByTestId('tour-skip')).toBeTruthy();
    expect(queryByTestId('tour-back')).toBeNull();

    fireEvent.press(getByTestId('tour-next'));
    await settle();

    expect(getByText('Second card')).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
    expect(getByTestId('tour-back')).toBeTruthy();
  });

  it('closes when Skip is pressed', async () => {
    const { getByTestId, queryByTestId } = render(
      <TourProvider steps={steps}><Harness /></TourProvider>
    );
    act(() => tour.start());
    await settle();

    fireEvent.press(getByTestId('tour-skip'));
    expect(queryByTestId('tour-overlay')).toBeNull();
  });
});
