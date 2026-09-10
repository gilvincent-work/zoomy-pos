import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ConfirmPaymentModal } from '../../components/ConfirmPaymentModal';

const baseProps = {
  visible: true,
  method: 'cash' as const,
  total: 300,
  customerHandle: '',
  onChangeCustomerHandle: jest.fn(),
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('ConfirmPaymentModal', () => {
  it('renders the method and total', () => {
    const { getByText } = render(<ConfirmPaymentModal {...baseProps} />);
    expect(getByText('₱300.00')).toBeTruthy();
  });

  it('shows the furbaby / IG handle field between the total and the actions', () => {
    const { getByTestId } = render(<ConfirmPaymentModal {...baseProps} />);
    expect(getByTestId('confirm-pay-handle')).toBeTruthy();
  });

  it('reports handle changes to the caller', () => {
    const onChangeCustomerHandle = jest.fn();
    const { getByTestId } = render(
      <ConfirmPaymentModal {...baseProps} onChangeCustomerHandle={onChangeCustomerHandle} />
    );
    fireEvent.changeText(getByTestId('confirm-pay-handle'), '@daisy_the_pug');
    expect(onChangeCustomerHandle).toHaveBeenCalledWith('@daisy_the_pug');
  });

  it('confirms without requiring a handle (optional field)', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(<ConfirmPaymentModal {...baseProps} onConfirm={onConfirm} />);
    fireEvent.press(getByTestId('confirm-pay-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('cancels via the Cancel button', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(<ConfirmPaymentModal {...baseProps} onCancel={onCancel} />);
    fireEvent.press(getByTestId('confirm-pay-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
