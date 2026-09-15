import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PetTypeChips } from '../../components/PetTypeChips';

describe('PetTypeChips', () => {
  it('reports the tapped pet to the caller', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PetTypeChips value={null} onChange={onChange} />);
    fireEvent.press(getByTestId('pet-chip-dog'));
    expect(onChange).toHaveBeenCalledWith('dog');
  });

  it('offers all three tags', () => {
    const { getByTestId } = render(<PetTypeChips value={null} onChange={jest.fn()} />);
    expect(getByTestId('pet-chip-dog')).toBeTruthy();
    expect(getByTestId('pet-chip-cat')).toBeTruthy();
    expect(getByTestId('pet-chip-both')).toBeTruthy();
  });

  it('tapping the selected tag clears it back to untagged', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PetTypeChips value="cat" onChange={onChange} />);
    fireEvent.press(getByTestId('pet-chip-cat'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not fire when disabled', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<PetTypeChips value={null} onChange={onChange} disabled />);
    fireEvent.press(getByTestId('pet-chip-both'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
