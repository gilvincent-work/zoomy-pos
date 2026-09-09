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

    it('shows "Oversold" when the cart quantity exceeds stock', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={2} badgeCount={3} />);
      expect(getByTestId('stock-warning').props.children.props.children).toBe('Oversold');
    });

    it('shows "Oversold" for an already-negative stock (prior oversell)', () => {
      const { getByTestId } = render(<ProductTile {...baseProps} stock={-1} badgeCount={1} />);
      expect(getByTestId('stock-warning').props.children.props.children).toBe('Oversold');
    });

    it('shows nothing before anything is added to the cart, even at 0 stock', () => {
      const { queryByTestId } = render(<ProductTile {...baseProps} stock={0} badgeCount={0} />);
      expect(queryByTestId('stock-warning')).toBeNull();
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
});
