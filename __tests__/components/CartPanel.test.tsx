import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CartPanel } from '../../components/CartPanel';
import { CartProvider, useCart } from '../../context/CartContext';

function renderPanel(props: Partial<React.ComponentProps<typeof CartPanel>> = {}) {
  return render(
    <CartProvider>
      <CartPanel method="cash" onMethodChange={jest.fn()} onCharge={jest.fn()} {...props} />
    </CartProvider>
  );
}

// Seeds one cart line before rendering CartPanel, since the panel itself has
// no "add new item" affordance (only steppers on existing lines).
function WithSeededItem({ children }: { children: React.ReactNode }) {
  const { addItem, items } = useCart();
  React.useEffect(() => {
    if (items.length === 0) addItem({ id: 1, name: 'Cake', price: 120 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function renderPanelWithItem(props: Partial<React.ComponentProps<typeof CartPanel>> = {}) {
  return render(
    <CartProvider>
      <WithSeededItem>
        <CartPanel method="cash" onMethodChange={jest.fn()} onCharge={jest.fn()} {...props} />
      </WithSeededItem>
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

  describe('stock ceiling on the "+" stepper', () => {
    it('disables "+" once canIncrement reports no stock left', () => {
      const canIncrement = jest.fn().mockReturnValue(false);
      const { getByTestId } = renderPanelWithItem({ canIncrement });
      expect(getByTestId('cart-plus-1').props.accessibilityState?.disabled).toBe(true);
    });

    it('leaves "+" enabled when canIncrement allows more', () => {
      const canIncrement = jest.fn().mockReturnValue(true);
      const { getByTestId } = renderPanelWithItem({ canIncrement });
      expect(getByTestId('cart-plus-1').props.accessibilityState?.disabled).toBeFalsy();
    });

    it('leaves "+" enabled when no canIncrement prop is given', () => {
      const { getByTestId } = renderPanelWithItem();
      expect(getByTestId('cart-plus-1').props.accessibilityState?.disabled).toBeFalsy();
    });
  });
});
