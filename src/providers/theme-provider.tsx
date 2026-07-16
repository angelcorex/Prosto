'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Client-side theme provider.
 *
 * Theme switching is a CSR concern (per the rendering strategy). This wraps
 * `next-themes`, which toggles the `.dark` class on <html> and persists the
 * user's choice. Color values themselves come from `src/config/theme.ts`.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
