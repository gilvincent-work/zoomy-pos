import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CartPanel } from '../../components/CartPanel';
import { CartProvider } from '../../context/CartContext';

function renderPanel(props: Partial<React.ComponentProps<typeof CartPanel>> = {}) {
  return render(
    <CartProvider>
      <CartPanel onCharge={jest.fn()} {...props} />
    </CartProvider>
  );
}

describe('CartPanel', () => {
  it('shows the empty hint when the cart has no items', () => {
    const { getByText } = renderPanel();
    expect(getByText('Tap treats to build the receipt.')).toBeTruthy();
  });

  it('disables charging an empty cart', () => {
    const onCharge = jest.fn();
    const { getByTestId } = renderPanel({ onCharge });
    fireEvent.press(getByTestId('cart-charge'));
    expect(onCharge).not.toHaveBeenCalled();
  });

  it('does not render the secondary payment label (long-press on Charge instead)', () => {
    const { queryByTestId, queryByText } = renderPanel({ onMorePayment: jest.fn() });
    expect(queryByTestId('cart-more-payment')).toBeNull();
    expect(queryByText('GCash / other · change')).toBeNull();
  });
});
