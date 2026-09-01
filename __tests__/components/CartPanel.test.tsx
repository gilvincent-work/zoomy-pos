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

  it('renders the secondary payment path only when provided', () => {
    const { queryByTestId, rerender } = renderPanel();
    expect(queryByTestId('cart-more-payment')).toBeNull();
    rerender(
      <CartProvider>
        <CartPanel onCharge={jest.fn()} onMorePayment={jest.fn()} />
      </CartProvider>
    );
    expect(queryByTestId('cart-more-payment')).toBeTruthy();
  });
});
