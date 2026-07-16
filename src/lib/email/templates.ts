import 'server-only';

import { site } from '@/config';

/**
 * Branded transactional email templates.
 *
 * NOTE ON STYLING: email clients require self-contained, inline styles and
 * hex colors (CSS variables / Tailwind / external sheets don't work in most
 * inboxes, and older Outlook rejects hsl()). The app-wide "no inline styles /
 * design tokens only" rule is a UI concern; emails are a separate medium, so
 * the small palette below is intentionally local to this file.
 */

type Locale = 'en' | 'ru';

/** Dark, brand-consistent palette mirroring the app's dark surfaces. */
const palette = {
  bg: '#0e0e10',
  card: '#161618',
  border: '#27272b',
  text: '#e8eaed',
  muted: '#8a8a93',
  accent: '#6f7bf7', // app `link` token, expressed as hex for email clients
  codeBg: '#202024',
} as const;

const logoUrl = `${site.url}/favicon/prosto_logo.png`;

const copy = {
  en: {
    otpPreheader: 'Your Prosto sign-in code',
    otpHeading: 'Sign in to Prosto',
    otpIntro: 'Use the code below to sign in. It expires in 60 minutes.',
    otpIgnore: "If you didn't request this, you can safely ignore this email.",
    resetPreheader: 'Reset your Prosto password',
    resetHeading: 'Reset your password',
    resetIntro: 'We received a request to reset your password. Tap the button below to choose a new one. This link expires in 60 minutes.',
    resetButton: 'Reset password',
    resetIgnore: "If you didn't request this, you can ignore this email — your password stays unchanged.",
    footer: 'Say it simply.',
  },
  ru: {
    otpPreheader: 'Ваш код входа в Prosto',
    otpHeading: 'Вход в Prosto',
    otpIntro: 'Используйте этот код для входа. Он действует 60 минут.',
    otpIgnore: 'Если вы не запрашивали код, просто проигнорируйте это письмо.',
    resetPreheader: 'Сброс пароля Prosto',
    resetHeading: 'Сброс пароля',
    resetIntro: 'Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы задать новый. Ссылка действует 60 минут.',
    resetButton: 'Сбросить пароль',
    resetIgnore: 'Если вы не запрашивали сброс, проигнорируйте письмо — пароль останется прежним.',
    footer: 'Говори проще.',
  },
} satisfies Record<Locale, Record<string, string>>;

/** Shared shell: hidden preheader, logo, content card, footer. */
function layout(locale: Locale, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
  </head>
  <body style="margin:0;padding:0;background-color:${palette.bg};">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${palette.bg};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <img src="${logoUrl}" width="48" height="48" alt="Prosto" style="display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background-color:${palette.card};border:1px solid ${palette.border};border-radius:16px;padding:32px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${palette.muted};letter-spacing:0.06em;">
                  ${site.name.toUpperCase()} · ${copy[locale].footer}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const fontStack = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Sign-in one-time code email. */
export function otpEmail(code: string, locale: Locale = 'en'): { subject: string; html: string; text: string } {
  const t = copy[locale];
  const body = `
    <h1 style="margin:0 0 12px;font-family:${fontStack};font-size:20px;font-weight:600;color:${palette.text};">${t.otpHeading}</h1>
    <p style="margin:0 0 24px;font-family:${fontStack};font-size:15px;line-height:1.5;color:${palette.muted};">${t.otpIntro}</p>
    <div style="background-color:${palette.codeBg};border:1px solid ${palette.border};border-radius:12px;padding:18px;text-align:center;">
      <span style="font-family:'JetBrains Mono','Courier New',monospace;font-size:30px;font-weight:700;letter-spacing:0.4em;color:${palette.text};">${code}</span>
    </div>
    <p style="margin:24px 0 0;font-family:${fontStack};font-size:13px;line-height:1.5;color:${palette.muted};">${t.otpIgnore}</p>`;
  return {
    subject: `${code} — ${t.otpHeading}`,
    html: layout(locale, t.otpPreheader, body),
    text: `${t.otpHeading}\n\n${t.otpIntro}\n\n${code}\n\n${t.otpIgnore}`,
  };
}

/** Password-reset email with an action button/link. */
export function recoveryEmail(url: string, locale: Locale = 'en'): { subject: string; html: string; text: string } {
  const t = copy[locale];
  const body = `
    <h1 style="margin:0 0 12px;font-family:${fontStack};font-size:20px;font-weight:600;color:${palette.text};">${t.resetHeading}</h1>
    <p style="margin:0 0 24px;font-family:${fontStack};font-size:15px;line-height:1.5;color:${palette.muted};">${t.resetIntro}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td align="center" style="border-radius:10px;background-color:${palette.accent};">
          <a href="${url}" style="display:inline-block;padding:12px 28px;font-family:${fontStack};font-size:15px;font-weight:600;color:#0e0e10;text-decoration:none;border-radius:10px;">${t.resetButton}</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-family:${fontStack};font-size:13px;line-height:1.5;color:${palette.muted};">${t.resetIgnore}</p>`;
  return {
    subject: t.resetHeading,
    html: layout(locale, t.resetPreheader, body),
    text: `${t.resetHeading}\n\n${t.resetIntro}\n\n${url}\n\n${t.resetIgnore}`,
  };
}
