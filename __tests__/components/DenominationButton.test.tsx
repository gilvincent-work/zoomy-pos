import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DenominationButton } from '../../components/DenominationButton';

describe('DenominationButton', () => {
  it('renders the peso amount', () => {
    const { getByText } = render(
      <DenominationButton amount={100} onPress={jest.fn()} />
    );
    expect(getByText('₱100')).toBeTruthy();
  });

  it('calls onPress with the amount', () => {
    const onPress = jest.fn();
    const { getByText } = render(<DenominationButton amount={500} onPress={onPress} />);
    fireEvent.press(getByText('₱500'));
    expect(onPress).toHaveBeenCalledWith(500);
  });
});
