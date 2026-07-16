import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

import { colorTokens, radius, shadows } from './src/config/theme';
import { spacing } from './src/config/spacing';
import { fontFamily, fontSize, fontWeight, lineHeight } from './src/config/typography';
import { breakpoints, containerWidth, zIndex } from './src/config/layout';

/**
 * Build the `colors` map from the semantic tokens defined in theme.ts.
 * Each role resolves to a CSS variable so it can switch with the active
 * scheme, while still supporting Tailwind's alpha modifier syntax.
 */
const colorRoles = Object.keys(colorTokens.light) as Array<keyof typeof colorTokens.light>;
const colors = colorRoles.reduce<Record<string, string>>((acc, role) => {
  acc[role] = `hsl(var(--${role}) / <alpha-value>)`;
  return acc;
}, {});

/** Inject the raw HSL channels for each scheme as CSS variables. */
const designTokensPlugin = plugin(({ addBase }) => {
  const toVars = (scheme: keyof typeof colorTokens) =>
    Object.fromEntries(
      Object.entries(colorTokens[scheme]).map(([role, value]) => [`--${role}`, value]),
    );

  addBase({
    ':root': toVars('light'),
    '.dark': toVars('dark'),
  });
});

const config: Config = {
  darkMode: 'class',
  // Gate all hover:/group-hover: styles behind `@media (hover: hover)` so they
  // never apply on touchscreens. Without this, tapping an element that has any
  // hover-dependent style makes the first tap a "hover" and only the second a
  // click (the classic iOS double-tap on chat rows, server icons, etc.).
  future: { hoverOnlyWhenSupported: true },
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/providers/**/*.{ts,tsx}',
    // The central icon registry lives here and composes utility classes at
    // runtime (e.g. the `-scale-x-110 scale-y-110` mirror for the reply icon).
    // Without this glob those classes are never generated and the mirror no-ops.
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    // Replace defaults with our tokens so arbitrary/off-scale values are
    // discouraged by construction.
    screens: breakpoints,
    spacing,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    borderRadius: radius,
    boxShadow: shadows,
    zIndex: Object.fromEntries(
      Object.entries(zIndex).map(([key, value]) => [key, String(value)]),
    ),
    extend: {
      colors,
      maxWidth: containerWidth,
      transitionDuration: {
        fast: '120ms',
        normal: '200ms',
        slow: '320ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'zoom-in': {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'msg-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'profile-pop': {
          '0%':   { opacity: '0', transform: 'scale(0.9) translateY(6px)' },
          '55%':  { opacity: '1', transform: 'scale(1.015) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'settings-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 260ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-in-right': 'slide-in-right 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        'pop-in': 'pop-in 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        'zoom-in': 'zoom-in 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'msg-in': 'msg-in 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        'profile-pop': 'profile-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'settings-in': 'settings-in 260ms cubic-bezier(0.32, 0.72, 0, 1)',
        // skeleton animation is defined in globals.css using CSS variables
        // so it can react to the active color scheme at runtime
        skeleton: 'skeleton-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [designTokensPlugin],
};

export default config;
