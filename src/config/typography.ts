/**
 * Typography tokens — the single source of truth for fonts, sizes, weights
 * and line heights.
 *
 * Font families reference CSS variables set by `next/font` in the root layout
 * (see `src/app/layout.tsx`). Sizes and weights are wired into the Tailwind
 * config. Never hardcode font sizes or weights in components.
 */

export const fontFamily: Record<'sans' | 'mono', string[]> = {
  sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
  mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
};

/** Tailwind fontSize tuple: [size, { lineHeight, letterSpacing? }]. */
type FontSizeValue = [string, { lineHeight: string; letterSpacing?: string }];

const size = (value: string, lineHeight: string, letterSpacing?: string): FontSizeValue => [
  value,
  letterSpacing ? { lineHeight, letterSpacing } : { lineHeight },
];

export const fontSize = {
  xs: size('0.75rem', '1rem'),
  sm: size('0.875rem', '1.25rem'),
  base: size('1rem', '1.5rem'),
  lg: size('1.125rem', '1.75rem'),
  xl: size('1.25rem', '1.75rem'),
  '2xl': size('1.5rem', '2rem'),
  '3xl': size('1.875rem', '2.25rem'),
  '4xl': size('2.25rem', '2.5rem', '-0.02em'),
  '5xl': size('3rem', '1.05', '-0.02em'),
  '6xl': size('3.75rem', '1', '-0.025em'),
  '7xl': size('4.5rem', '1', '-0.025em'),
};

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

export const lineHeight = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
} as const;

export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;
