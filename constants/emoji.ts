// Curated emoji palette for product tiles. Tap-only (users don't type these,
// especially on desktop), so this is the full set offered in the picker.
// Grouped loosely by proteins, seafood, produce, extras, and pet cues.
export const PRODUCT_EMOJIS = [
  '🍬', '🦴', '🐾', '🐕', '🐈', '⭐️',
  '🥩', '🍖', '🍗', '🥓', '🍔', '🌭',
  '🐟', '🐠', '🍤', '🦐', '🦑', '🦀',
  '🐔', '🦆', '🦃', '🥚', '🧀', '🥛',
  '🌿', '🍀', '🥕', '🫐', '🍓', '🍎',
  '🍐', '🎃', '🍠', '🥦', '🥜', '🍯',
] as const;

/** A tile can show up to 3 emoji (like the bundle tiles). */
export const MAX_EMOJI = 3;

/** Split a string into grapheme clusters so a multi-codepoint emoji counts as one. */
export function emojiGraphemes(input: string): string[] {
  const Seg = (Intl as {Segmenter?: typeof Intl.Segmenter}).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, {granularity: 'grapheme'}).segment(input), (s) => s.segment);
  return Array.from(input);
}

/** Strip whitespace and cap at MAX_EMOJI grapheme clusters. */
export function clampEmoji(input: string): string {
  return emojiGraphemes(input.replace(/\s+/g, '')).slice(0, MAX_EMOJI).join('');
}
