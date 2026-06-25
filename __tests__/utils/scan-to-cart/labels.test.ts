import { SCAN_LABELS, ScanLabel } from '../../../utils/scan-to-cart/labels';

describe('SCAN_LABELS', () => {
  it('has exactly 24 entries', () => {
    expect(SCAN_LABELS).toHaveLength(24);
  });

  it('has no gaps — every index matches its array position', () => {
    SCAN_LABELS.forEach((label, i) => {
      expect(label.classIndex).toBe(i);
    });
  });

  it('every entry has non-empty productName, variantName, and displayName', () => {
    SCAN_LABELS.forEach((label) => {
      expect(label.productName.length).toBeGreaterThan(0);
      expect(label.variantName.length).toBeGreaterThan(0);
      expect(label.displayName).toBe(`${label.productName} — ${label.variantName}`);
    });
  });

  it('index 6 is Freeze-Dried Munchies Salmon', () => {
    expect(SCAN_LABELS[6].productName).toBe('Freeze-Dried Munchies');
    expect(SCAN_LABELS[6].variantName).toBe('Salmon');
  });

  it('index 22 is Tasty Treats Chicken Jerky', () => {
    expect(SCAN_LABELS[22].productName).toBe('Tasty Treats');
    expect(SCAN_LABELS[22].variantName).toBe('Chicken Jerky');
  });
});
