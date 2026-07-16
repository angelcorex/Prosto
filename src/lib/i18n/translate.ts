import { getMessages } from './request';

function pick(obj: Record<string, unknown>, path: string): string | undefined {
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
 * Server-side translation helper (no plugin required).
 *
 * Usage:
 *   const t = await getT('auth.signUp');
 *   t('title')            // → "Create an account"
 *   t('submit', { min: 10 }) // → "At least 10 characters"
 */
export async function getT(namespace: string) {
  const messages = await getMessages();
  return function t(key: string, values?: Record<string, string | number>): string {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const raw = pick(messages as Record<string, unknown>, fullKey);
    if (raw == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[i18n] Missing key: ${fullKey}`);
      }
      return key;
    }
    return interpolate(raw, values);
  };
}
