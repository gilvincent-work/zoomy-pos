import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DetectionResultsSheet } from '../../components/DetectionResultsSheet';
import { SCAN_LABELS } from '../../utils/scan-to-cart/labels';
import type { DetectionResult } from '../../utils/scan-to-cart/classifier';

const makeResults = (): DetectionResult[] => [
  { label: SCAN_LABELS[6],  confidence: 0.92, classIndex: 6  },
  { label: SCAN_LABELS[2],  confidence: 0.05, classIndex: 2  },
  { label: SCAN_LABELS[10], confidence: 0.02, classIndex: 10 },
];

const baseProps = {
  results: makeResults(),
  capturedImageUri: 'data:image/jpeg;base64,/9j/',
  onConfirm: jest.fn(),
  onScanAgain: jest.fn(),
  onClose: jest.fn(),
};

describe('DetectionResultsSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders top-3 result cards', () => {
    const { getByText } = render(<DetectionResultsSheet {...baseProps} />);
    expect(getByText('Freeze-Dried Munchies — Salmon')).toBeTruthy();
    expect(getByText('Freeze-Dried Munchies — Chicken Breast')).toBeTruthy();
    expect(getByText('Meaty Treats — Duck Strips')).toBeTruthy();
  });

  it('shows confidence percentage on each card', () => {
    const { getByText } = render(<DetectionResultsSheet {...baseProps} />);
    expect(getByText('92%')).toBeTruthy();
  });

  it('top result is selected by default', () => {
    const { getByTestId } = render(<DetectionResultsSheet {...baseProps} />);
    expect(getByTestId('result-card-0').props.accessibilityState?.selected).toBe(true);
    expect(getByTestId('result-card-1').props.accessibilityState?.selected).toBe(false);
  });

  it('tapping a different card selects it', () => {
    const { getByTestId } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getByTestId('result-card-1'));
    expect(getByTestId('result-card-1').props.accessibilityState?.selected).toBe(true);
    expect(getByTestId('result-card-0').props.accessibilityState?.selected).toBe(false);
  });

  it('quantity starts at 1 and increments/decrements', () => {
    const { getByTestId, getByText } = render(<DetectionResultsSheet {...baseProps} />);
    expect(getByText('1')).toBeTruthy();
    fireEvent.press(getByTestId('qty-increment'));
    expect(getByText('2')).toBeTruthy();
    fireEvent.press(getByTestId('qty-decrement'));
    expect(getByText('1')).toBeTruthy();
  });

  it('decrement does not go below 1', () => {
    const { getByTestId, getByText } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getByTestId('qty-decrement'));
    expect(getByText('1')).toBeTruthy();
  });

  it('Add to Cart calls onConfirm with selected label and quantity', () => {
    const { getByTestId, getByText } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getByTestId('qty-increment'));
    fireEvent.press(getByText('Add to Cart'));
    expect(baseProps.onConfirm).toHaveBeenCalledWith(SCAN_LABELS[6], 2);
  });

  it('Scan Again calls onScanAgain', () => {
    const { getByText } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getByText('Scan Again'));
    expect(baseProps.onScanAgain).toHaveBeenCalledTimes(1);
  });
});
