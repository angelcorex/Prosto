import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

// All `lucide-react` imports are served by our Remix Icon adapter instead.
const ICON_SHIM = fileURLToPath(new URL('./src/lib/icons/index.tsx', import.meta.url));

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self';" },
];

function storageRemotePatterns() {
  const sources = [process.env.NEXT_PUBLIC_STORAGE_URL, process.env.S3_ENDPOINT].filter(Boolean);
  const seen = new Set();
  const patterns = [];
  for (const raw of sources) {
    try {
      const u = new URL(raw);
      const key = `${u.protocol}//${u.host}`;
      if (seen.has(key)) continue;
      seen.add(key);
      patterns.push({
        protocol: u.protocol.replace(':', ''),
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: '/**',
      });
    } catch {
      // ignore malformed URLs
    }
  }
  return patterns;
}

// If ATARAXIS_WEB_BASE points at a non-default host, allow its images too.
function ataraxisRemotePattern() {
  const raw = process.env.ATARAXIS_WEB_BASE;
  if (!raw) return [];
  try {
    const u = new URL(raw);
    if (u.hostname === 'ataraxis.ru') return [];
    return [{
      protocol: u.protocol.replace(':', ''),
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
      pathname: '/**',
    }];
  } catch {
    return [];
  }
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emit browser source maps in the production build so a minified client crash
  // (e.g. "k is null") maps back to the real file/function/line in devtools.
  // Trade-off: .map files are served alongside the bundles, so anyone can read
  // your original client source. Fine for debugging; turn off once diagnosed.
  productionBrowserSourceMaps: true,
  // Allow loading dev assets when browsing via the loopback IP (needed because
  // Spotify rejects `http://localhost` redirect URIs but accepts 127.0.0.1).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Keep navigated/prefetched routes warm in the client router cache so going
  // back to a recently visited page (and prefetched links) renders instantly
  // instead of doing a fresh server round-trip every time.
  experimental: {
    // The icon registry (src/lib/icons) pulls named icons from the huge
    // `@solar-icons/react` barrel (~1200 modules). Without this, dev has to
    // walk the whole barrel on the first hit of almost every route (icons are
    // imported app-wide via the lucide-react alias), which makes compiles crawl.
    // This rewrites the barrel import to direct per-icon imports.
    optimizePackageImports: ['@solar-icons/react'],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // Uploads (avatars, banners, post & chat attachments, channel themes,
    // server home assets) are sent to the server as multipart form data via
    // Server Actions. This is a ceiling for ALL of them — must sit above the
    // largest single upload. Super Prosto subscribers can upload up to 100 MB
    // (see MAX_UPLOAD_MB_PREMIUM), so keep this a bit above that.
    serverActions: {
      bodySizeLimit: '110mb',
    },
  },
  // Alias lucide-react to the Remix Icon adapter (build = webpack, dev = turbopack).
  turbopack: {
    resolveAlias: {
      'lucide-react': './src/lib/icons/index.tsx',
    },
  },
  webpack(config) {
    config.resolve.alias = { ...(config.resolve.alias ?? {}), 'lucide-react': ICON_SHIM };
    return config;
  },
  // ESLint is intentionally not configured here — Next.js 16 no longer runs it
  // during `next build`. Lint separately with `npm run lint`.
  // Type errors now fail the build (type-check is clean) so regressions are
  // caught before deploy.
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    // The optimizer runs in-process on a single VPS (not Vercel's edge), so each
    // miss is a CPU-bound sharp re-encode that blocks the event loop. Keep
    // optimized variants on disk for a long time (content-addressed keys are
    // immutable) so post/banner images are re-encoded once, not repeatedly.
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Ataraxis album-cover proxy (now-playing card). Host is overridable via
      // ATARAXIS_WEB_BASE; the default public host is ataraxis.ru.
      { protocol: 'https', hostname: 'ataraxis.ru', pathname: '/**' },
      ...ataraxisRemotePattern(),
      ...storageRemotePatterns(),
    ],
  },
};

export default nextConfig;
