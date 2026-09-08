// Two palettes, one identity. `dark` is the incumbent warm-dark system; `light`
// mirrors it as warm paper, keeping the Zoomy brand pink and every semantic
// token role (Subtle = tinted fill, Dim = matching border, etc.) so components
// stay theme-agnostic and read colors through `useTheme()` — never import a
// palette directly for rendering.

export type ThemeMode = 'dark' | 'light';

/** The token roles every palette must define; values are any color string. */
export type Palette = Record<
  | 'bg' | 'surface' | 'elevated'
  | 'borderDark' | 'border'
  | 'pink' | 'pinkDim' | 'pinkSubtle'
  | 'red' | 'redSubtle' | 'redDim'
  | 'green' | 'greenDim' | 'greenSubtle'
  | 'textPrimary' | 'textSecondary' | 'textMuted',
  string
>;

const dark: Palette = {
  // Backgrounds — warm dark, not cold navy
  bg:          '#111010',
  surface:     '#1d1b18',
  elevated:    '#272420',

  // Borders
  borderDark:  '#2a2724',
  border:      '#38332e',

  // Zoomy brand pink — primary CTAs, active states, badges
  pink:        '#ff3d7a',
  pinkDim:     '#8a1f42',
  pinkSubtle:  '#2a0f19',

  // Red — charge action (kept distinct from pink)
  red:         '#e94560',
  redSubtle:   '#2a1219',

  // Green — success / save / proof confirmed
  green:       '#32c86e',
  greenDim:    '#1a6b3a',
  greenSubtle: '#0d2618',

  // Red — destructive / clear / cancel
  redDim:      '#7a2333',

  // Text
  textPrimary:   '#ede9e3',
  textSecondary: '#9e9690',
  textMuted:     '#5c5650',
} as const;

// Same roles, inverted for a warm-paper light mode. Brand hues are deepened just
// enough to stay legible on light fills; Subtle tints become pale, Dim borders
// become mid-tone.
const light: Palette = {
  bg:          '#efe9e1',
  surface:     '#fbf7f1',
  elevated:    '#ffffff',

  borderDark:  '#e4ddd2',
  border:      '#d5ccbe',

  pink:        '#e0175e',
  pinkDim:     '#ec9ab8',
  pinkSubtle:  '#fdeaf1',

  red:         '#d62c46',
  redSubtle:   '#fce9ec',

  green:       '#1f9d57',
  greenDim:    '#93cdab',
  greenSubtle: '#e6f5ec',

  redDim:      '#e0a3ac',

  textPrimary:   '#1f1b17',
  textSecondary: '#6a625a',
  textMuted:     '#8c8276',
};

export const palettes: Record<ThemeMode, Palette> = { dark, light };

export const F = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  26,
  xxxl: 34,
} as const;

export const R = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
} as const;
