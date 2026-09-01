// hooks/useColumns.ts
import { DimensionValue, useWindowDimensions } from 'react-native';

const TILE_TARGET = 110;
const GRID_PADDING = 24;
const MIN_COLS = 3;

/**
 * Column count for the product grid.
 *
 * @param availableWidth Optional width of the area the grid actually occupies.
 *   Pass the left-pane width in the Option H landscape split-view so columns are
 *   sized to the pane, not the whole screen. Omit for full-width layouts
 *   (existing behavior is preserved).
 */
export function useColumns(
  availableWidth?: number,
  opts?: { tileTarget?: number; minCols?: number }
) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const effectiveWidth = availableWidth ?? width;
  const tileTarget = opts?.tileTarget ?? TILE_TARGET;
  const minCols = opts?.minCols ?? MIN_COLS;
  const numColumns = Math.max(
    minCols,
    Math.floor((effectiveWidth - GRID_PADDING) / tileTarget)
  );
  const tileMaxWidth = `${100 / numColumns}%` as DimensionValue;
  return { numColumns, tileMaxWidth, isLandscape };
}
