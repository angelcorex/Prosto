export type DeviceKind = 'apple' | 'mobile' | 'desktop';

/**
 * Best-effort detection of the device the current session runs on.
 *  - Apple (iPhone / iPad / Mac) → 'apple'
 *  - Other phones (Android, etc.) → 'mobile'
 *  - Everything else (Windows / Linux PC) → 'desktop'
 *
 * Inside the desktop client we trust the native platform (process.platform);
 * macOS counts as Apple. In the browser we read the user-agent / platform,
 * accounting for iPadOS reporting itself as a Mac with a touch screen.
 */
export function detectDevice(): DeviceKind {
  if (typeof navigator === 'undefined') return 'desktop';

  // Desktop (Electron) client exposes its OS platform via the preload bridge.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const desktop = (typeof window !== 'undefined' ? (window as any).prostoDesktop : null) as
    | { isDesktop?: boolean; platform?: string }
    | null;
  if (desktop?.isDesktop && typeof desktop.platform === 'string') {
    return desktop.platform === 'darwin' ? 'apple' : 'desktop';
  }

  const ua = navigator.userAgent || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = ((navigator as any).platform as string) || '';
  const touch = navigator.maxTouchPoints ?? 0;

  const isApple =
    /iPhone|iPad|iPod/i.test(ua) ||
    /Macintosh|Mac OS X/i.test(ua) ||
    /^Mac/i.test(platform) ||
    // iPadOS 13+ masquerades as a desktop Mac but has a touch screen.
    (/Mac/i.test(platform) && touch > 1);
  if (isApple) return 'apple';

  if (/Android|Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return 'mobile';

  return 'desktop';
}
