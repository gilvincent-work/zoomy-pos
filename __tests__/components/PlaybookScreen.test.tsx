import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PlaybookScreen from '../../app/modals/playbook';
import { FLOW_STEPS, PRODUCT_NOTES, QUICK_GUIDE } from '../../constants/playbook';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('PlaybookScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens on the Flow tab with every step in order', () => {
    const { getByTestId, getByText } = render(<PlaybookScreen />);
    FLOW_STEPS.forEach((s) => {
      expect(getByTestId(`playbook-step-${s.id}`)).toBeTruthy();
      expect(getByText(s.title)).toBeTruthy();
    });
  });

  it('switches the shown branch when a branch chip is tapped', () => {
    const { getByTestId, getByText, queryByText } = render(<PlaybookScreen />);
    const recommend = FLOW_STEPS.find((s) => s.id === 'recommend')!;
    const firstItem = (i: number) => {
      const block = recommend.branches![i].blocks[0];
      return block.kind === 'actions' ? block.items[0] : '';
    };

    expect(getByText(firstItem(0))).toBeTruthy();
    fireEvent.press(getByTestId('playbook-branch-recommend-2'));
    expect(getByText(firstItem(2))).toBeTruthy();
    expect(queryByText(firstItem(0))).toBeNull();
  });

  it('shows the free taste shortcut on the has-a-pet branch and navigates', () => {
    const { getByTestId } = render(<PlaybookScreen />);
    fireEvent.press(getByTestId('playbook-shortcut-free-taste'));
    expect(router.push).toHaveBeenCalledWith('/modals/free-taste');
  });

  it('shows the say-this line for the small-pet recommendation', () => {
    const { getByText } = render(<PlaybookScreen />);
    const block = FLOW_STEPS.find((s) => s.id === 'recommend')!.branches![0].blocks.find((b) => b.kind === 'say')!;
    expect(block.kind === 'say' && getByText(`“${block.text}”`)).toBeTruthy();
  });

  it('shows the quick guide and every product note on the Products tab', () => {
    const { getByTestId, getByText } = render(<PlaybookScreen />);
    fireEvent.press(getByTestId('playbook-tab-products'));
    expect(getByTestId('playbook-guide')).toBeTruthy();
    expect(getByText(QUICK_GUIDE[0].customer)).toBeTruthy();
    PRODUCT_NOTES.forEach((n) => expect(getByTestId(`playbook-note-${n.id}`)).toBeTruthy());
  });

  it('marks the selected tab for accessibility', () => {
    const { getByTestId } = render(<PlaybookScreen />);
    expect(getByTestId('playbook-tab-flow').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(getByTestId('playbook-tab-products'));
    expect(getByTestId('playbook-tab-products').props.accessibilityState).toMatchObject({ selected: true });
  });
});
