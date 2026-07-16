/**
 * Site-level configuration — app identity and primary navigation.
 *
 * Navigation items reference Lucide icon names resolved at the component
 * layer, keeping this config free of React/JSX imports.
 */

export const site = {
  name: 'Prosto',
  tagline: 'Say it simply.',
  // Canonical production URL — used for absolute links and OG/metadata.
  url: 'https://prosto.ink',
  // Desktop app distribution. The Windows installer is published to GitHub
  // Releases in the standalone desktop repo (angelcorex/prostodesktop); Vercel
  // isn't suited for large binaries. Override via env.
  download: {
    page: '/download',
    windows:
      process.env.NEXT_PUBLIC_DESKTOP_WIN_URL ||
      'https://github.com/angelcorex/prostodesktop/releases/latest/download/Prosto-Setup.exe',
  },
  // Routes are defined here so navigation and links stay consistent app-wide.
  routes: {
    home: '/',
    feed: '/feed',
    search: '/search',
    messages: '/messages',
    settings: '/settings',
    super: '/super',
    download: '/download',
    profile: (username: string) => `/u/${username}`,
    invite: (token: string) => `/invite/${token}`,
    server: (id: string) => `/s/${id}`,
    serverChannel: (id: string, channel: string) => `/s/${id}/${channel}`,
    serverInvite: (token: string) => `/i/${token}`,
    signIn: '/sign-in',
    signUp: '/sign-up',
    signInCode: '/sign-in/code',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    authConfirm: '/auth/confirm',
    legal: {
      terms: '/legal/terms',
      privacy: '/legal/privacy',
      guidelines: '/legal/guidelines',
    },
  },
} as const;

export type AppRoutes = typeof site.routes;
