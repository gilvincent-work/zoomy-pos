export type ScanLabel = {
  classIndex: number;
  productName: string;
  variantName: string;
  displayName: string;
};

// Order is fixed — must match public/ml-model/labels.json and ml/labels_template.json.
// If you retrain the model with a different class ordering, update this array to match.
export const SCAN_LABELS: ScanLabel[] = [
  { classIndex:  0, productName: 'Freeze-Dried Munchies', variantName: 'Beef Liver',         displayName: 'Freeze-Dried Munchies — Beef Liver' },
  { classIndex:  1, productName: 'Freeze-Dried Munchies', variantName: 'Capelin',             displayName: 'Freeze-Dried Munchies — Capelin' },
  { classIndex:  2, productName: 'Freeze-Dried Munchies', variantName: 'Chicken Breast',      displayName: 'Freeze-Dried Munchies — Chicken Breast' },
  { classIndex:  3, productName: 'Freeze-Dried Munchies', variantName: 'Chicken Egg',         displayName: 'Freeze-Dried Munchies — Chicken Egg' },
  { classIndex:  4, productName: 'Freeze-Dried Munchies', variantName: 'Chicken Liver',       displayName: 'Freeze-Dried Munchies — Chicken Liver' },
  { classIndex:  5, productName: 'Freeze-Dried Munchies', variantName: 'Duck Breast',         displayName: 'Freeze-Dried Munchies — Duck Breast' },
  { classIndex:  6, productName: 'Freeze-Dried Munchies', variantName: 'Salmon',              displayName: 'Freeze-Dried Munchies — Salmon' },
  { classIndex:  7, productName: 'Freeze-Dried Munchies', variantName: 'Trio Pack',           displayName: 'Freeze-Dried Munchies — Trio Pack' },
  { classIndex:  8, productName: 'Meaty Treats',          variantName: 'Beef Slices',         displayName: 'Meaty Treats — Beef Slices' },
  { classIndex:  9, productName: 'Meaty Treats',          variantName: 'Chicken Slices',      displayName: 'Meaty Treats — Chicken Slices' },
  { classIndex: 10, productName: 'Meaty Treats',          variantName: 'Duck Strips',         displayName: 'Meaty Treats — Duck Strips' },
  { classIndex: 11, productName: 'Meaty Treats',          variantName: 'Salmon Cubes',        displayName: 'Meaty Treats — Salmon Cubes' },
  { classIndex: 12, productName: 'Multivitamin Treats',   variantName: 'Beef',                displayName: 'Multivitamin Treats — Beef' },
  { classIndex: 13, productName: 'Multivitamin Treats',   variantName: 'Chicken',             displayName: 'Multivitamin Treats — Chicken' },
  { classIndex: 14, productName: 'Multivitamin Treats',   variantName: 'Duck',                displayName: 'Multivitamin Treats — Duck' },
  { classIndex: 15, productName: 'Munchies Superfood',    variantName: 'Beef & Blueberry',    displayName: 'Munchies Superfood — Beef & Blueberry' },
  { classIndex: 16, productName: 'Munchies Superfood',    variantName: 'Cat Grass',           displayName: 'Munchies Superfood — Cat Grass' },
  { classIndex: 17, productName: 'Munchies Superfood',    variantName: 'Cat Grass (Makapal)', displayName: 'Munchies Superfood — Cat Grass (Makapal)' },
  { classIndex: 18, productName: 'Munchies Superfood',    variantName: 'Chicken & Cranberry', displayName: 'Munchies Superfood — Chicken & Cranberry' },
  { classIndex: 19, productName: 'Munchies Superfood',    variantName: 'Chicken & Pumpkin',   displayName: 'Munchies Superfood — Chicken & Pumpkin' },
  { classIndex: 20, productName: 'Munchies Superfood',    variantName: 'Duck & Apple',        displayName: 'Munchies Superfood — Duck & Apple' },
  { classIndex: 21, productName: 'Munchies Superfood',    variantName: 'Duck & Pear',         displayName: 'Munchies Superfood — Duck & Pear' },
  { classIndex: 22, productName: 'Tasty Treats',          variantName: 'Chicken Jerky',       displayName: 'Tasty Treats — Chicken Jerky' },
  { classIndex: 23, productName: 'Tasty Treats',          variantName: 'Duck Jerky',          displayName: 'Tasty Treats — Duck Jerky' },
];
