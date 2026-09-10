import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { palettes, type Palette, type ThemeMode } from '../constants/theme';
import { saveThemeMode } from '../utils/theme-preference';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: Palette;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
};

// Default to the product's dark palette so a component rendered outside a
// provider (isolated tests, previews) still themes correctly instead of
// crashing. The real app always mounts ThemeProvider at the root, where the
// toggle and persistence live.
const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: palettes.dark,
  toggle: () => {},
  setMode: () => {},
});

/**
 * Holds the active theme and resolves it to a color set. The default is dark;
 * `initialMode` lets the root pass the persisted choice loaded at startup so the
 * first paint already matches the saved preference (no dark-to-light flash).
 * Changing the theme persists it in the background.
 */
export function ThemeProvider({
  initialMode = 'dark',
  children,
}: {
  initialMode?: ThemeMode;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    saveThemeMode(next).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveThemeMode(next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: palettes[mode], toggle, setMode }),
    [mode, toggle, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read the active theme. Components resolve colors here, then build styles from them. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
