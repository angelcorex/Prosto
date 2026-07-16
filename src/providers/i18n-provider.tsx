'use client';

import { createContext, useContext, type ReactNode } from 'react';

type Messages = Record<string, unknown>;

const I18nContext = createContext<{ messages: Messages; locale: string }>({
  messages: {},
  locale: 'en',
});

export function I18nProvider({
  messages,
  locale,
  children,
}: {
  messages: Messages;
  locale: string;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ messages, locale }}>{children}</I18nContext.Provider>
  );
}

function pickNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

/**
 * Client-side translation hook.
 *
 * Usage:
 *   const t = useT('auth.signUp');
 *   t('title')  // → localized string
 */
export function useT(namespace: string) {
  const { messages } = useContext(I18nContext);
  return function t(key: string, values?: Record<string, string | number>): string {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const raw = pickNested(messages, fullKey);
    if (raw == null) return key;
    return interpolate(raw, values);
  };
}
