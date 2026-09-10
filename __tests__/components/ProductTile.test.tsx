import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProductTile } from '../../components/ProductTile';

const baseProps = {
  id: 1,
  name: 'Cake',
  price: 120,
  badgeCount: 0,
  onPress: jest.fn(),
  onLongPress: jest.fn(),
};

describe('ProductTile', () => {
  it('renders name and price', () => {
    const { getByText } = render(<ProductTile {...baseProps} />);
    expect(getByText('Cake')).toBeTruthy();
    expect(getByText('₱120.00')).toBeTruthy();
  });

  it('does not show badge when badgeCount is 0', () => {
    const { queryByTestId } = render(<ProductTile {...baseProps} badgeCount={0} />);
    expect(queryByTestId('badge')).toBeNull();
  });

  it('shows badge with count when badgeCount > 0', () => {
    const { getByTestId } = render(<ProductTile {...baseProps} badgeCount={3} />);
    expect(getByTestId('badge')).toBeTruthy();
    expect(getByTestId('badge').props.children).toBe(3);
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<ProductTile {...baseProps} onPress={onPress} />);
    fireEvent.press(getByTestId('tile'));
    expect(onPress).toHaveBeenCalledWith(1);
  });

  it('calls onLongPress when long-pressed', () => {
    const onLongPress = jest.fn();
    const { getByTestId } = render(
      <ProductTile {...baseProps} onLongPress={onLongPress} badgeCount={2} />
    );
    fireEvent(getByTestId('tile'), 'longPress');
    expect(onLongPress).toHaveBeenCalledWith(1);
  });

  it('hides price for variant products', () => {
    const { queryByText } = render(<ProductTile {...baseProps} hasVariants />);
    expect(queryByText('₱120.00')).toBeNull();
  });

  it('shows the minus + count control when active and onMinus is provided', () => {
    const { getByTestId } = render(
      <ProductTile {...baseProps} badgeCount={2} onMinus={jest.fn()} />
    );
    expect(getByTestId('minus-btn')).toBeTruthy();
    expect(getByTestId('badge').props.children).toBe(2);
  });

  it('calls onMinus when the minus control is tapped', () => {
    const onMinus = jest.fn();
    const { getByTestId } = render(
      <ProductTile {...baseProps} badgeCount={2} onMinus={onMinus} />
    );
    fireEvent.press(getByTestId('minus-btn'));
    expect(onMinus).toHaveBeenCalledWith(1);
  });

  it('does not show the minus control when inactive', () => {
    const { queryByTestId } = render(
      <ProductTile {...baseProps} badgeCount={0} onMinus={jest.fn()} />
    );
    expect(queryByTestId('minus-btn')).toBeNull();
  });

  it('shows the clear button when active and onRemove is provided, and calls it', () => {
    const onRemove = jest.fn();
    const { getByTestId } = render(
      <ProductTile {...baseProps} badgeCount={4} onRemove={onRemove} />
    );
    fireEvent.press(getByTestId('remove-btn'));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('does not show the clear button when inactive', () => {
    const { queryByTestId } = render(
      <ProductTile {...baseProps} badgeCount={0} onRemove={jest.fn()} />
    );
    expect(queryByTestId('remove-btn')).toBeNull();
  });

  describe('stock warning', () => {
    it('shows no warning below the stock count', () => {
      const { queryByTestId } = render(<ProductTile {...baseProps} stock={5} badgeCount={3} />);
      expect(queryByTestId('stock-warning')).toBeNull();
    });

    it('shows "Last stock" when the cart quantity exactly meets stock', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={3} badgeCount={3} />);
      expect(getByTestId('stock-warning').props.children.props.children).toBe('Last stock');
    });

    it('shows the persistent tag instead of the in-cart warning before anything is added, at 0 stock', () => {
      const { queryByTestId } = render(<ProductTile {...baseProps} stock={0} badgeCount={0} />);
      expect(queryByTestId('stock-warning')).toBeNull();
      expect(queryByTestId('out-of-stock-tag')).toBeTruthy();
    });

    it('skips the warning for variant products (no per-variant stock)', () => {
      const { queryByTestId } = render(
        <ProductTile {...baseProps} hasVariants stock={1} badgeCount={3} />
      );
      expect(queryByTestId('stock-warning')).toBeNull();
    });

    it('skips the warning when stock is not provided', () => {
      const { queryByTestId } = render(<ProductTile {...baseProps} badgeCount={3} />);
      expect(queryByTestId('stock-warning')).toBeNull();
    });
  });

  describe('out-of-stock tag', () => {
    it('shows the tag when stock is 0 and nothing is in the cart', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={0} badgeCount={0} />);
      expect(getByTestId('out-of-stock-tag').props.children.props.children).toBe('No Stock');
    });

    it('shows the tag for a negative (already-oversold) stock too', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={-2} badgeCount={0} />);
      expect(getByTestId('out-of-stock-tag')).toBeTruthy();
    });

    it('does not show the tag once there is stock', () => {
      const { queryByTestId } = render(<ProductTile {...baseProps} stock={5} badgeCount={0} />);
      expect(queryByTestId('out-of-stock-tag')).toBeNull();
    });

    it('does not show the tag once the item is already in the cart (in-cart warning takes over)', () => {
      const { queryByTestId, getByTestId } = render(<ProductTile {...baseProps} stock={0} badgeCount={2} />);
      expect(queryByTestId('out-of-stock-tag')).toBeNull();
      expect(getByTestId('stock-warning').props.children.props.children).toBe('Last stock');
    });

    it('still allows tapping the tile when out of stock', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(<ProductTile {...baseProps} stock={0} badgeCount={0} onPress={onPress} />);
      fireEvent.press(getByTestId('tile'));
      expect(onPress).toHaveBeenCalledWith(1);
    });

    it('greys out the tile when out of stock', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={0} badgeCount={0} />);
      const style = [].concat(getByTestId('tile').props.style);
      expect(style).toContainEqual(expect.objectContaining({ opacity: 0.45 }));
    });

    it('does not grey out an active tile at its stock ceiling', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={2} badgeCount={2} />);
      const style = [].concat(getByTestId('tile').props.style);
      expect(style).not.toContainEqual(expect.objectContaining({ opacity: 0.45 }));
    });

    it('skips the tag for variant products (no per-variant stock)', () => {
      const { queryByTestId } = render(
        <ProductTile {...baseProps} hasVariants stock={0} badgeCount={0} />
      );
      expect(queryByTestId('out-of-stock-tag')).toBeNull();
    });

    it('skips the tag when stock is not provided', () => {
      const { queryByTestId } = render(<ProductTile {...baseProps} badgeCount={0} />);
      expect(queryByTestId('out-of-stock-tag')).toBeNull();
    });
  });
});
