/**
 * Theme tokens — the single source of truth for color and surface design.
 *
 * Values are stored as raw HSL channels ("H S% L%") so they can be composed
 * with alpha at the Tailwind layer via `hsl(var(--token) / <alpha-value>)`.
 *
 * These tokens are injected as CSS variables (`:root` and `.dark`) by the
 * Tailwind plugin in `tailwind.config.ts`. Nothing else in the app hardcodes
 * colors — changing a value here updates the entire application.
 *
 * Palette direction: clean, content-focused neutrals with a confident blue
 * accent (inspired by VK / Discord / Twitter).
 */

export type ColorScheme = 'light' | 'dark';

/** Semantic color roles. Add roles here, never one-off colors in components. */
export type ColorToken =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'success'
  | 'success-foreground'
  | 'warning'
  | 'warning-foreground'
  | 'link'
  | 'border'
  | 'input'
  | 'ring';

type Palette = Record<ColorToken, string>;

/*
 * Neutral, content-focused palette. The `primary` role is a high-contrast
 * tone (near-black in light, near-white in dark) for calm, modern surfaces.
 * A single blue `link` accent provides harmony without visual noise.
 */

const light: Palette = {
  background: '0 0% 99%',
  foreground: '240 12% 10%',
  card: '0 0% 99%',
  'card-foreground': '240 12% 10%',
  popover: '0 0% 99%',
  'popover-foreground': '240 12% 10%',
  primary: '240 12% 12%',
  'primary-foreground': '0 0% 98%',
  secondary: '240 8% 95%',
  'secondary-foreground': '240 12% 12%',
  muted: '240 8% 95%',
  'muted-foreground': '240 5% 50%',
  accent: '240 8% 93%',
  'accent-foreground': '240 12% 12%',
  destructive: '355 70% 62%',
  'destructive-foreground': '0 0% 98%',
  success: '139 47% 62%',
  'success-foreground': '0 0% 98%',
  warning: '40 85% 60%',
  'warning-foreground': '240 12% 12%',
  link: '235 86% 72%',
  border: '240 8% 88%',
  input: '240 8% 88%',
  ring: '240 8% 72%',
};

const dark: Palette = {
  background: '240 4% 6%',          /* ~#0e0e10 — very dark, almost black */
  foreground: '220 14% 93%',
  card: '240 4% 9%',                 /* ~#161618 */
  'card-foreground': '220 14% 93%',
  popover: '240 4% 9%',
  'popover-foreground': '220 14% 93%',
  primary: '220 14% 95%',
  'primary-foreground': '240 4% 9%',
  secondary: '240 3% 15%',          /* #242428 — selected/hover */
  'secondary-foreground': '220 14% 93%',
  muted: '240 3% 13%',              /* slightly darker than accent for skeleton */
  'muted-foreground': '235 6% 54%',
  accent: '240 3% 15%',             /* #242428 — nav highlight, hover bg */
  'accent-foreground': '220 14% 93%',
  destructive: '355 65% 65%',
  'destructive-foreground': '0 0% 98%',
  success: '139 47% 69%',
  'success-foreground': '240 4% 6%',
  warning: '40 85% 65%',
  'warning-foreground': '240 4% 6%',
  link: '235 86% 77%',
  border: '240 3% 17%',
  input: '240 3% 18%',
  ring: '240 3% 36%',
};

export const colorTokens: Record<ColorScheme, Palette> = { light, dark };

/** Default scheme used before a user preference is resolved. */
export const defaultColorScheme: ColorScheme = 'light';

/**
 * Border radius scale. Components reference these via Tailwind's `rounded-*`
 * utilities, which are wired to these values in the Tailwind config.
 */
export const radius = {
  none: '0px',
  sm: '0.375rem',   // 6px
  md: '0.5rem',     // 8px
  lg: '0.625rem',   // 10px  ← inputs, textareas, cards
  xl: '0.875rem',   // 14px
  '2xl': '1rem',    // 16px  ← nav items, banners
  '3xl': '1.25rem', // 20px  ← modals, popovers
  full: '9999px',
} as const;

/** Elevation / shadow scale. */
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 hsl(222 47% 11% / 0.05)',
  md: '0 4px 12px -2px hsl(222 47% 11% / 0.08)',
  lg: '0 12px 32px -8px hsl(222 47% 11% / 0.12)',
} as const;

export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadows;

/**
 * Literal colors for contexts that cannot read CSS variables — canvas
 * rendering (favicon + taskbar unread badges) and the PWA manifest. Kept here
 * so every color in the app still has a single source of truth; changing a
 * value here updates every such surface.
 */
export const literalColors = {
  /** Unread badge fill (favicon bubble, taskbar overlay). */
  badge: '#f23f42',
  /** Text/outline drawn on top of the badge. */
  badgeForeground: '#ffffff',
  /** PWA manifest background + theme color. */
  pwaBackground: '#0b0c10',
  /** Brand purple — link-unfurl accent (theme-color meta) and default swatch. */
  brand: '#7c5cff',
} as const;
