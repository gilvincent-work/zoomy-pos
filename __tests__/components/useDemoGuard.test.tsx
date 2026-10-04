import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';
import { useDemoGuard } from '../../components/tour/useDemoGuard';
import { TourProvider, useTour } from '../../context/TourContext';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../db/saved-bundles', () => ({ getActivePickBundles: jest.fn().mockResolvedValue([]) }));

const mockShowToast = jest.fn();
jest.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

let guard: () => boolean;
let tour: ReturnType<typeof useTour>;

function Probe() {
  guard = useDemoGuard();
  return null;
}

function Capture() {
  tour = useTour();
  useEffect(() => {}, []);
  return null;
}

describe('useDemoGuard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lets handlers run when no tour provider exists', () => {
    render(<Probe />);
    expect(guard()).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('lets handlers run when the tour is not active', () => {
    render(<TourProvider steps={[]}><Probe /></TourProvider>);
    expect(guard()).toBe(false);
  });

  it('blocks the handler and shows a toast while the tour is active', () => {
    render(<TourProvider steps={[]}><Capture /><Probe /></TourProvider>);
    act(() => tour.start());
    expect(guard()).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Demo only' }));
  });
});
