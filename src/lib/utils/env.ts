/**
 * Environment access — fail fast with a clear message when required
 * configuration is missing, instead of surfacing opaque runtime errors deep
 * in the Supabase client.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
  }
  return value;
}

export const env = {
  supabase: {
    get url() {
      const raw = required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
      // Tolerate a URL copied with a trailing `/rest/v1/` (or extra slashes):
      // the JS/SSR clients need the bare project URL or auth/storage break.
      return raw.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    },
    get anonKey() {
      return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    },
    get serviceRoleKey() {
      return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
    },
  },
  spotify: {
    get clientId() {
      return required('SPOTIFY_CLIENT_ID', process.env.SPOTIFY_CLIENT_ID);
    },
    get clientSecret() {
      return required('SPOTIFY_CLIENT_SECRET', process.env.SPOTIFY_CLIENT_SECRET);
    },
  },
  /**
   * Ataraxis music service (partner API). A single server-side API key grants
   * access on our behalf — there is no per-user OAuth secret. Users link their
   * account via a poll-based consent flow (link/init → approve → link/status).
   * OPTIONAL: when the key is absent, `configured` is false and the provider is
   * hidden / non-connectable, exactly like Web Push.
   */
  ataraxis: {
    get apiKey() {
      return process.env.ATARAXIS_API_KEY ?? '';
    },
    /** Partner API base (no trailing slash). */
    get apiBase() {
      return (process.env.ATARAXIS_API_BASE || 'https://ataraxis.ru/api/partner').replace(/\/+$/, '');
    },
    /** Public web origin, used to resolve relative cover URLs + the link page. */
    get webBase() {
      return (process.env.ATARAXIS_WEB_BASE || 'https://ataraxis.ru').replace(/\/+$/, '');
    },
    get configured() {
      return !!process.env.ATARAXIS_API_KEY;
    },
  },
  /**
   * Bot platform (public API + developer portal). OPTIONAL: a dedicated pepper
   * for hashing bot API tokens. When unset, the hash falls back to a value
   * derived from the service-role key (see `lib/bots/token.ts`), so bot tokens
   * are peppered by default with no extra configuration.
   */
  bots: {
    get tokenPepper() {
      return process.env.BOT_TOKEN_PEPPER ?? '';
    },
  },
  resend: {
    get apiKey() {
      return required('RESEND_API_KEY', process.env.RESEND_API_KEY);
    },
    /** From address for transactional email. Domain must be verified in Resend. */
    get from() {
      return process.env.EMAIL_FROM || 'Prosto <no-reply@justprosto.xyz>';
    },
  },
  /**
   * Web Push (VAPID) — background notifications when the app is closed/minimised.
   * Generate a keypair once with `npx web-push generate-vapid-keys` and put the
   * values in .env. The public key is also exposed to the client (NEXT_PUBLIC).
   * Push is OPTIONAL: when unconfigured, `configured` is false and the app
   * simply skips background push (in-app sound/toasts still work).
   */
  push: {
    get publicKey() {
      return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
    },
    get privateKey() {
      return process.env.VAPID_PRIVATE_KEY ?? '';
    },
    /** `mailto:` or https contact, required by the push services. */
    get subject() {
      return process.env.VAPID_SUBJECT || 'mailto:support@justprosto.xyz';
    },
    get configured() {
      return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    },
  },
  /**
   * Object storage (MinIO / any S3-compatible backend).
   *
   * Credentials are server-only and are read lazily, so importing `env` on the
   * client never throws — only `publicUrl` (NEXT_PUBLIC) is safe to read there.
   */
  storage: {
    get endpoint() {
      return required('S3_ENDPOINT', process.env.S3_ENDPOINT).replace(/\/+$/, '');
    },
    get region() {
      return process.env.S3_REGION || 'us-east-1';
    },
    get accessKeyId() {
      return required('S3_ACCESS_KEY_ID', process.env.S3_ACCESS_KEY_ID);
    },
    get secretAccessKey() {
      return required('S3_SECRET_ACCESS_KEY', process.env.S3_SECRET_ACCESS_KEY);
    },
    get bucket() {
      return required('S3_BUCKET', process.env.S3_BUCKET);
    },
    /**
     * Public base URL objects are served from — the S3 endpoint root. Object
     * URLs are `<publicUrl>/<bucket>/<key>`. Client-safe (NEXT_PUBLIC); falls
     * back to the raw endpoint when not set explicitly.
     */
    get publicUrl() {
      const explicit = process.env.NEXT_PUBLIC_STORAGE_URL;
      if (explicit) return explicit.replace(/\/+$/, '');
      return (process.env.S3_ENDPOINT ?? '').replace(/\/+$/, '');
    },
  },
} as const;
