import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import { CalendarRangeModal } from '../../components/CalendarRangeModal';

const initial = { start: new Date(2026, 5, 1), end: new Date(2026, 5, 1) };

describe('CalendarRangeModal', () => {
  it('applies a range after tapping a start and end day', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByText('Apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const range = onApply.mock.calls[0][0];
    expect(range.start.getDate()).toBe(5);
    expect(range.end.getDate()).toBe(10);
  });

  it('swaps start/end if the second tap is before the first', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByText('Apply'));

    const range = onApply.mock.calls[0][0];
    expect(range.start.getDate()).toBe(5);
    expect(range.end.getDate()).toBe(10);
  });

  it('disables Apply until any date is picked', () => {
    const onApply = jest.fn();
    const { getByText } = render(
      <CalendarRangeModal visible initialRange={null} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByText('Apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies a single-day range when only the From date is tapped', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={null} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByText('Apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const range = onApply.mock.calls[0][0];
    expect(range.start.getDate()).toBe(5);
    expect(range.end.getDate()).toBe(5);
  });

  it('clears a pending selection so Apply is disabled again', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByText('Clear'));
    fireEvent.press(getByText('Apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows placeholder chip labels with no selection', () => {
    const { getByTestId } = render(
      <CalendarRangeModal visible initialRange={null} onApply={jest.fn()} onClose={jest.fn()} />
    );
    expect(within(getByTestId('cal-chip-from')).getByText('Tap a date')).toBeTruthy();
    expect(within(getByTestId('cal-chip-to')).getByText('Same as From')).toBeTruthy();
  });

  it('fills the From chip and advances to the To chip after one tap', () => {
    const { getByTestId } = render(
      <CalendarRangeModal visible initialRange={null} onApply={jest.fn()} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    expect(within(getByTestId('cal-chip-from')).getByText('Jun 5')).toBeTruthy();
    expect(within(getByTestId('cal-chip-to')).getByText('Same as From')).toBeTruthy();
  });

  it('fills both chips after a start and end day are tapped', () => {
    const { getByTestId } = render(
      <CalendarRangeModal visible initialRange={null} onApply={jest.fn()} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    expect(within(getByTestId('cal-chip-from')).getByText('Jun 5')).toBeTruthy();
    expect(within(getByTestId('cal-chip-to')).getByText('Jun 10')).toBeTruthy();
  });

  it('lets tapping the To chip revise the end date without resetting the start', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={null} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByTestId('cal-chip-to'));
    fireEvent.press(getByTestId('cal-day-2026-5-15'));
    fireEvent.press(getByText('Apply'));

    const range = onApply.mock.calls[0][0];
    expect(range.start.getDate()).toBe(5);
    expect(range.end.getDate()).toBe(15);
  });
});
