# Responsive Fluid Grid for All Tile Grids

## Problem

All tile grids (product grid, bundle presets, variant picker) use a hardcoded 3-column layout. On larger screens like iPad, tiles become unnecessarily large and waste screen real estate. The grid should adapt to the available width so tiles stay a consistent, comfortable size across all devices.

## Design

### Shared `useColumns` hook

New file: `hooks/useColumns.ts`

Uses `useWindowDimensions()` to compute the number of columns based on a target tile width. Returns both the column count and a percentage string for `maxWidth` styling.

```typescript
import { useWindowDimensions } from 'react-native';

const TILE_TARGET = 110; // ideal tile width in px
const GRID_PADDING = 24; // 2 * 12px container padding
const MIN_COLS = 3;

export function useColumns() {
  const { width } = useWindowDimensions();
  const numColumns = Math.max(MIN_COLS, Math.floor((width - GRID_PADDING) / TILE_TARGET));
  const tileMaxWidth = `${100 / numColumns}%`;
  return { numColumns, tileMaxWidth };
}
```

Recalculates automatically on device rotation or iPad split-view resize.

### Grid changes

All three grids follow the same pattern:

**`app/index.tsx` — Product FlatList:**
- `numColumns` from hook instead of hardcoded `3`
- `key={numColumns}` on FlatList to force re-mount when columns change (React Native requirement)
- `tileWrapper.maxWidth` set dynamically via inline style using `tileMaxWidth`

**`app/index.tsx` — Bundle preset grid:**
- Chunk-by-`numColumns` instead of chunk-by-3
- `presetTileWrapper.maxWidth` set dynamically
- Spacer count uses `numColumns` instead of hardcoded 3

**`components/VariantPickerModal.tsx` — Variant picker FlatList:**
- Same pattern: hook, dynamic `numColumns`, dynamic `maxWidth`, `key` prop

### What stays the same
- All tile styles: `aspectRatio: 0.9`, padding, colors, badges, minus buttons
- Theme constants (no changes)
- Row spacing: `gap: 8`, `marginBottom: 8`
- Grid container padding: 12px

### Files to modify
- `hooks/useColumns.ts` — new file
- `app/index.tsx` — product grid + bundle preset grid
- `components/VariantPickerModal.tsx` — variant picker grid

### Verification
1. Run on phone simulator (~390px width) — should show 3 columns as before
2. Run on iPad simulator (~1024px width) — should show 8-9 columns
3. Rotate device — columns should recalculate
4. iPad split-view — columns should adapt to narrower window
5. Bundle presets and product tiles should remain the same size relative to each other
6. Variant picker modal should also adapt
