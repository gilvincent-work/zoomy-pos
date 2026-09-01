import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CategoryTabs } from '../../components/CategoryTabs';
import { SubcategoryFilter } from '../../components/SubcategoryFilter';

describe('CategoryTabs', () => {
  const categories = ['Freeze Dried', 'Meaty Treats', 'Tasty Treats'];

  it('renders a pill per category', () => {
    const { getByText } = render(
      <CategoryTabs categories={categories} active="Freeze Dried" onSelect={jest.fn()} />
    );
    categories.forEach((c) => expect(getByText(c)).toBeTruthy());
  });

  it('marks the active tab as selected', () => {
    const { getByTestId } = render(
      <CategoryTabs categories={categories} active="Meaty Treats" onSelect={jest.fn()} />
    );
    expect(getByTestId('category-tab-Meaty Treats').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByTestId('category-tab-Freeze Dried').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('calls onSelect with the tapped category', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <CategoryTabs categories={categories} active="Freeze Dried" onSelect={onSelect} />
    );
    fireEvent.press(getByTestId('category-tab-Tasty Treats'));
    expect(onSelect).toHaveBeenCalledWith('Tasty Treats');
  });

  it('renders nothing when there are no categories', () => {
    const { toJSON } = render(<CategoryTabs categories={[]} active="" onSelect={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});

describe('SubcategoryFilter', () => {
  const subs = ['Cat Grass / Yogurt', 'Fish', 'Meats', 'Super Food'];

  it('renders nothing when there are no subcategories', () => {
    const { toJSON } = render(
      <SubcategoryFilter subcategories={[]} active={null} onSelect={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders a chip per subcategory and reports taps', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <SubcategoryFilter subcategories={subs} active="Fish" onSelect={onSelect} />
    );
    fireEvent.press(getByTestId('subcategory-chip-Meats'));
    expect(onSelect).toHaveBeenCalledWith('Meats');
    expect(getByTestId('subcategory-chip-Fish').props.accessibilityState).toMatchObject({ selected: true });
  });
});
