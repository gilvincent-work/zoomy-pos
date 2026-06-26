import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DetectionResultsSheet } from '../../components/DetectionResultsSheet';
import { SCAN_LABELS } from '../../utils/scan-to-cart/labels';
import type { DetectedProduct } from '../../utils/scan-to-cart/detector';

const makeDet = (classIndex: number, confidence = 0.9): DetectedProduct => ({
  bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
  classIndex,
  label: SCAN_LABELS[classIndex],
  confidence,
});

const makeResults = (): DetectedProduct[] => [
  makeDet(6,  0.92),   // Freeze-Dried Munchies — Salmon
  makeDet(2,  0.75),   // Freeze-Dried Munchies — Chicken Breast
  makeDet(10, 0.60),   // Meaty Treats — Duck Strips
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

  it('renders a card for each detected product', () => {
    const { getByText } = render(<DetectionResultsSheet {...baseProps} />);
    expect(getByText('Freeze-Dried Munchies — Salmon')).toBeTruthy();
    expect(getByText('Freeze-Dried Munchies — Chicken Breast')).toBeTruthy();
    expect(getByText('Meaty Treats — Duck Strips')).toBeTruthy();
  });

  it('shows confidence percentage on each card', () => {
    const { getByText } = render(<DetectionResultsSheet {...baseProps} />);
    expect(getByText('92% confidence')).toBeTruthy();
    expect(getByText('75% confidence')).toBeTruthy();
  });

  it('all cards start with quantity 1', () => {
    const { getAllByTestId } = render(<DetectionResultsSheet {...baseProps} />);
    const qtyValues = getAllByTestId('qty-value');
    expect(qtyValues.length).toBe(3);
    qtyValues.forEach(v => expect(v.props.children).toBe(1));
  });

  it('increment button increases quantity for that card', () => {
    const { getAllByTestId } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getAllByTestId('qty-increment')[0]);
    const qtyValues = getAllByTestId('qty-value');
    expect(qtyValues[0].props.children).toBe(2);
    expect(qtyValues[1].props.children).toBe(1);
  });

  it('decrement button decreases quantity but minimum is 0 (removes the card)', () => {
    const { getAllByTestId } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getAllByTestId('qty-decrement')[0]);
    // qty 1 → 0: card 0 is removed, cards 1 and 2 still show qty-value
    const qtyValues = getAllByTestId('qty-value');
    expect(qtyValues.length).toBe(2);
    expect(qtyValues[0].props.children).toBe(1);
  });

  it('remove button sets quantity to 0 and shows Undo', () => {
    const { getAllByTestId, getAllByText } = render(<DetectionResultsSheet {...baseProps} />);
    const removeButtons = getAllByTestId('remove-btn');
    fireEvent.press(removeButtons[0]);
    expect(getAllByText('Undo').length).toBe(1);
  });

  it('Undo restores a removed item to quantity 1', () => {
    const { getAllByTestId, getByText, queryAllByText } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getAllByTestId('remove-btn')[0]);
    expect(queryAllByText('Undo').length).toBe(1);
    fireEvent.press(getByText('Undo'));
    expect(queryAllByText('Undo').length).toBe(0);
  });

  it('Add to Cart calls onConfirm with batch items', () => {
    const { getAllByTestId, getByText } = render(<DetectionResultsSheet {...baseProps} />);
    // Increment first card to qty 2
    fireEvent.press(getAllByTestId('qty-increment')[0]);
    fireEvent.press(getByText('Add 3 to Cart'));
    expect(baseProps.onConfirm).toHaveBeenCalledWith([
      { label: SCAN_LABELS[6],  quantity: 2 },
      { label: SCAN_LABELS[2],  quantity: 1 },
      { label: SCAN_LABELS[10], quantity: 1 },
    ]);
  });

  it('Add to Cart is disabled when all items are removed', () => {
    const { getAllByTestId, getByText } = render(<DetectionResultsSheet {...baseProps} />);
    const removeButtons = getAllByTestId('remove-btn');
    removeButtons.forEach(btn => fireEvent.press(btn));
    fireEvent.press(getByText('Add to Cart'));
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });

  it('Scan Again calls onScanAgain', () => {
    const { getByText } = render(<DetectionResultsSheet {...baseProps} />);
    fireEvent.press(getByText('Scan Again'));
    expect(baseProps.onScanAgain).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no products detected', () => {
    const { getByText } = render(
      <DetectionResultsSheet {...baseProps} results={[]} />,
    );
    expect(getByText('No products detected')).toBeTruthy();
  });
});
