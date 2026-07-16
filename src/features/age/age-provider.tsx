'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { isAdultFromBirthDate } from '@/lib/utils/age';

interface ViewerAge {
  /** Stored birth date (`yyyy-mm-dd`) or null when never set. */
  birthDate: string | null;
  /** True when a birth date is set and the viewer is 18+. */
  isAdult: boolean;
  /** True once a birth date exists (drives the one-time prompt). */
  hasBirthDate: boolean;
}

const AgeContext = createContext<ViewerAge>({ birthDate: null, isAdult: false, hasBirthDate: false });

/**
 * Provides the current viewer's age status to the whole app so NSFW gating
 * (posts, channels, servers, media) reads one source of truth instead of
 * prop-drilling. Seeded from SSR; kept in sync if the prop changes (e.g. after
 * the birth-date modal sets it and the layout re-renders).
 */
export function AgeProvider({ birthDate, children }: { birthDate: string | null; children: ReactNode }) {
  const [bd, setBd] = useState<string | null>(birthDate);
  useEffect(() => { setBd(birthDate); }, [birthDate]);

  const value: ViewerAge = {
    birthDate: bd,
    isAdult: isAdultFromBirthDate(bd),
    hasBirthDate: bd != null,
  };
  return <AgeContext.Provider value={value}>{children}</AgeContext.Provider>;
}

/** Read the viewer's age status (for NSFW gating). */
export function useViewerAge(): ViewerAge {
  return useContext(AgeContext);
}
