import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import PlaybookScreen from '../../app/modals/playbook';
import { FLOW_STEPS, PRODUCT_NOTES } from '../../constants/playbook';

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
    const [small, big] = recommend.branches!;

    expect(getByText(small.actions[0])).toBeTruthy();
    fireEvent.press(getByTestId('playbook-branch-recommend-1'));
    expect(getByText(big.actions[0])).toBeTruthy();
    expect(queryByText(small.actions[0])).toBeNull();
  });

  it('shows the free taste shortcut on the has-a-pet branch and navigates', () => {
    const { getByTestId } = render(<PlaybookScreen />);
    fireEvent.press(getByTestId('playbook-shortcut-free-taste'));
    expect(router.push).toHaveBeenCalledWith('/modals/free-taste');
  });

  it('shows the say-this line for the small-pet recommendation', () => {
    const { getByText } = render(<PlaybookScreen />);
    const say = FLOW_STEPS.find((s) => s.id === 'recommend')!.branches![0].say!;
    expect(getByText(`“${say}”`)).toBeTruthy();
  });

  it('lists every product note on the Products tab and filters by audience', () => {
    const { getByTestId, queryByTestId } = render(<PlaybookScreen />);
    fireEvent.press(getByTestId('playbook-tab-products'));
    PRODUCT_NOTES.forEach((n) => expect(getByTestId(`playbook-note-${n.id}`)).toBeTruthy());

    fireEvent.press(getByTestId('playbook-filter-big'));
    expect(getByTestId('playbook-note-meaty-treats')).toBeTruthy();
    expect(queryByTestId('playbook-note-cat-grass')).toBeNull();
  });

  it('marks the selected tab for accessibility', () => {
    const { getByTestId } = render(<PlaybookScreen />);
    expect(getByTestId('playbook-tab-flow').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(getByTestId('playbook-tab-products'));
    expect(getByTestId('playbook-tab-products').props.accessibilityState).toMatchObject({ selected: true });
  });
});
