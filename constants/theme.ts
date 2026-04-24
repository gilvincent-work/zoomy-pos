export const C = {
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
