/**
 * Layout tokens — structural dimensions for the application shell.
 *
 * Centralizes responsive breakpoints, container widths, fixed chrome sizes
 * (header, sidebars) and z-index layering. Feature layouts consume these
 * instead of hardcoding pixel values.
 */

/** Responsive breakpoints (min-width), wired into the Tailwind `screens`. */
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

/** Max content widths for the central column / page containers. */
export const containerWidth = {
  sm: '40rem', // 640px — reading/messages column
  md: '48rem', // 768px — feed column
  lg: '64rem', // 1024px — wide content
  xl: '80rem', // 1280px — full app shell
} as const;

/** Fixed dimensions for persistent app chrome. */
export const shell = {
  headerHeight: '3.5rem', // 56px
  leftSidebarWidth: '15rem', // 240px — primary navigation
  rightSidebarWidth: '20rem', // 320px — contextual panel
  bottomNavHeight: '3.5rem', // 56px — mobile navigation
} as const;

/**
 * Mobile bottom navigation height — the SINGLE source of truth shared by the
 * floating tab bar and the content clearance below it. The bar is
 * `bottomNavHeight` tall and floats `bottomNavGap` above the screen edge; the
 * scroll clearance is (bar + gap*2 + safe-area) so the last row always clears
 * the bar with no double-padding. Exposed as `--bottom-nav-space` in globals.
 */
export const mobileNav = {
  barHeight: '3.5rem', // 56px — the pill bar itself
  gap: '0.5rem', // 8px — float above the bottom edge
} as const;

/**
 * Z-index layering. Centralized to prevent stacking conflicts across
 * overlays, modals, popovers and toasts.
 */
export const zIndex = {
  base: 0,
  sticky: 10,
  header: 30,
  sidebar: 20,
  dropdown: 40,
  overlay: 50,
  modal: 60,
  popover: 70,
  toast: 80,
} as const;

export type Breakpoint = keyof typeof breakpoints;
export type ContainerWidth = keyof typeof containerWidth;
export type ZIndexLayer = keyof typeof zIndex;
