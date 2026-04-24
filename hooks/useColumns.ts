// hooks/useColumns.ts
import { useWindowDimensions } from 'react-native';

const TILE_TARGET = 110;
const GRID_PADDING = 24;
const MIN_COLS = 3;

export function useColumns() {
  const { width } = useWindowDimensions();
  const numColumns = Math.max(MIN_COLS, Math.floor((width - GRID_PADDING) / TILE_TARGET));
  const tileMaxWidth = `${100 / numColumns}%`;
  return { numColumns, tileMaxWidth } as const;
}
