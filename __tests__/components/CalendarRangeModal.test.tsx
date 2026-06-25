import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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

  it('disables Apply until both start and end are picked', () => {
    const onApply = jest.fn();
    const { getByText } = render(
      <CalendarRangeModal visible initialRange={null} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByText('Apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears a pending selection', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarRangeModal visible initialRange={initial} onApply={onApply} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('cal-day-2026-5-5'));
    fireEvent.press(getByText('Clear'));
    fireEvent.press(getByTestId('cal-day-2026-5-10'));
    fireEvent.press(getByText('Apply'));
    expect(onApply).not.toHaveBeenCalled();
  });
});
