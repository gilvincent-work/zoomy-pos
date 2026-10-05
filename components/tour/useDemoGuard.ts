import { useCallback } from 'react';
import { useToast } from '../Toast';
import { useTourActive } from '../../context/TourContext';

/**
 * Safety net for the tour: the overlay already blocks touches, but any handler
 * that records money or stock calls this first. While the tour runs it shows a
 * "Demo only" toast and returns true, so the handler must return early.
 */
export function useDemoGuard(): () => boolean {
  const active = useTourActive();
  const { showToast } = useToast();
  return useCallback(() => {
    if (!active) return false;
    showToast({ variant: 'error', title: 'Demo only', message: 'The tour does not save anything.' });
    return true;
  }, [active, showToast]);
}
