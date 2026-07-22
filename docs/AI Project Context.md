# Prosto — AI Project Context

> **Mandatory reading for every AI agent and developer before working in this repository.**
>
> Read this document together with [`Engineering Constitution.md`](./Engineering%20Constitution.md). The constitution describes the desired engineering rules; this document records the architecture and repository state that were actually observed.

## Document status

- **Last repository audit:** 2026-07-22.
- **Audit scope:** source tree, manifests and lockfiles, Next.js routes, representative feature flows, Supabase clients and migrations, security boundaries, object storage, Go edge service, Tauri desktop shell, bot SDK, CI/deployment configuration, local build/type/lint/audit commands.
- **Not verified:** the live production database, which migrations are currently applied in Supabase, production environment-variable values, VPS/reverse-proxy configuration, production logs and live external services.
- Secret values from `.env`, `.env.local`, deploy tooling and credentials were deliberately not read or copied here.
- Update this document when the architecture, security model, deployment process or validation status materially changes.

## Instructions for AI agents

Before changing code:

1. Read this document and `docs/Engineering Constitution.md`.
2. Inspect the exact modules, migrations and call sites affected by the task. This document is context, not a substitute for reading current code.
3. Treat the browser and the public Supabase anon key as hostile. PostgreSQL RLS, grants and guarded RPCs are the real authorization boundary.
4. Never import service-role, S3, email, token or encryption secrets into client code.
5. Reuse existing feature modules, UI components, storage helpers, Supabase clients and RPC conventions before adding abstractions.
6. Add new database changes as new forward migrations. Do not rewrite migrations that may already be applied.
7. Preserve localization, server/client boundaries, realtime cleanup, rate limits, privacy rules and age gates.
8. Run the most relevant validation after changes. At minimum use type-checking; run lint and a production build when the affected scope warrants it.
9. Do not claim live production behavior unless it has been checked separately.
10. If an observed fact in this document becomes stale, update the document in the same change.

## Product overview

Prosto is a social platform combining:

- public profiles and additional usernames;
- a feed, posts, media attachments, likes, reposts, reactions, comments and hashtags;
- follows, friend requests, friend invite links, blocks and notifications;
- direct messages, group conversations, replies, read receipts, typing, presence, calls, stickers, GIFs and message search;
- Discord-style servers, categories, channels, roles, permission overrides, invites, discovery, emojis, themes, moderation, bans and timeouts;
- profile connections and now-playing integrations;
- age collection and NSFW gating;
- premium, moderator and administrator flags;
- a bot/developer platform with slash commands, long polling and an official TypeScript SDK;
- PWA installation, web push and a Tauri desktop client.

The UI currently supports Russian and English.

## Repository layout

### Root web application

- `src/app/` — Next.js App Router pages, route handlers, route groups and layouts.
  - `src/app/(auth)/` — sign-in, sign-up, code login, recovery and reset UI.
  - `src/app/(app)/` — authenticated application routes: feed, profiles, messages, friends, notifications, search, servers and settings.
  - `src/app/admin/` — administrator dashboard, users, logs and system health.
  - `src/app/developers/` — developer portal, bot management and public API documentation.
  - `src/app/api/` — uploads, search, GIFs, link previews, push, integrations and bot API v1.
  - `src/app/auth/` — OAuth, OTP confirmation and desktop handoff routes.
  - `src/app/legal/`, `invite/`, `sinvite/`, `i/`, `download/` — public/legal/invite/download routes.
- `src/features/` — domain-oriented feature modules.
- `src/components/` — shared shell, UI, layout and skeleton components.
- `src/lib/` — shared infrastructure: Supabase, storage, security, rate limiting, bots, accounts, email, push, logging, i18n, link previews and utilities.
- `src/config/` — site metadata, layout, theme, typography, spacing and limits.
- `src/providers/` — theme, locale, platform style and image viewer providers.
- `src/proxy.ts` — Next.js 16 request proxy that delegates session handling to Supabase middleware.
- `messages/en.json`, `messages/ru.json` — translation catalogs.
- `public/` — PWA worker, icons, sounds, avatars, stickers, emoji and landing previews.

### Database and auxiliary runtimes

- `supabase/migrations/` — 126 SQL migration files. There is no verified local Supabase runtime configuration in the repository.
- `services/edge/` — Go 1.22/Gin service for GIF proxying and SSRF-sensitive link previews.
- `desktop-tauri/` — Tauri 2/Rust desktop shell with local splash/offline pages and a remote webview.
- `packages/prosto-bot/` — official ESM TypeScript bot SDK.
- `scripts/` — administrative user script and Twemoji vendoring.
- `.github/workflows/deploy.yml` — production deployment over SSH to a VPS.
- `docs/Engineering Constitution.md` — desired engineering rules.

## Declared technology stack

### Web

- Next.js `^16.2.10` (validated build used 16.2.10).
- React and React DOM `^19.0.0`.
- TypeScript `^5.6.3`, strict mode, `noUncheckedIndexedAccess` and no emit.
- Tailwind CSS 3, PostCSS and Autoprefixer.
- Supabase JS and Supabase SSR.
- AWS SDK v3 for S3-compatible object storage.
- `web-push`, Emoji Mart data, Remix Icon, Solar Icons, Lenis, `clsx` and `tailwind-merge`.

### Other runtimes

- PostgreSQL/Supabase Auth, PostgREST and Realtime.
- Go 1.22 with Gin 1.10 for the optional edge service.
- Tauri 2/Rust 2021 for desktop.
- Node.js 18+ is declared by the bot SDK; the audit environment used Node 24.9.0 and npm 10.8.3.

### Important dependency inconsistency

The web app declares Next.js 16 but `eslint-config-next` remains on major version 15. Keep framework and lint tooling compatibility in mind when upgrading or fixing lint.

## Web request and rendering lifecycle

1. `src/proxy.ts` runs `updateSession()` from `src/lib/supabase/middleware.ts` on non-static requests.
2. Middleware creates a per-request nonce, prepares the full CSP in report-only mode, refreshes the Supabase session and synchronizes auth cookies.
3. `src/app/layout.tsx` resolves locale and messages, sets metadata, injects nonce-bearing startup/JSON-LD scripts and mounts global providers.
4. `src/app/(app)/layout.tsx` calls cached `getCurrentUser()` and redirects unauthenticated users to sign-in.
5. The authenticated layout loads the current profile and composes the application shell: icon rail, DM sidebar, server rail/sidebar, right panels, notifications, presence heartbeat, age provider and desktop/PWA helpers.
6. Server pages fetch initial data through Supabase table queries or PostgreSQL RPCs. Independent reads are often parallelized with `Promise.all`.
7. Client components take over interactive behavior, optimistic state, Supabase Realtime subscriptions and safety polling.

`getCurrentUser()` and `getCurrentProfile()` in `src/lib/supabase/server.ts` use React request caching to avoid repeated auth/profile round trips within one render.

## Data access model

### Supabase clients

- `src/lib/supabase/client.ts` — browser client using the public anon key and auth cookies.
- `src/lib/supabase/server.ts` — cookie-bound server client for Server Components, actions and route handlers.
- `src/lib/supabase/middleware.ts` — session refresh and security headers.
- `src/lib/supabase/admin.ts` — service-role client marked `server-only`; it bypasses RLS and must remain confined to trusted server code.

### Query conventions

- Public and user-scoped reads use RLS or guarded `SECURITY DEFINER` RPCs.
- Complex feeds, messaging, permissions and admin operations are concentrated in PostgreSQL functions.
- Mutations are a mixture of Server Actions, direct RLS-protected table operations and guarded RPCs.
- The browser can call Supabase directly, so hiding controls in UI or checking only in Next.js is never sufficient authorization.

### Type-safety limitation

`src/lib/supabase/database.types.ts` is still a placeholder whose tables, views and functions are empty records. Consequently, many real database calls cast Supabase clients/results to `any`. Generate current database types and remove casts incrementally rather than treating the current file as real schema coverage.

## Database model

The audit found 48 distinct tables created by migrations:

- Identity/social: `profiles`, `profile_usernames`, `follows`, `friend_requests`, `friend_invites`, `blocks`, `notifications`.
- Content: `posts`, `post_likes`, `reposts`, `post_comments`, `post_reactions`, `post_hashtags`.
- Conversations: `conversations`, `conversation_participants`, `direct_messages`, `message_reactions`, `gif_favorites`.
- Presence/settings: `user_sessions`, `user_notify_prefs`, `push_subscriptions`.
- Abuse controls: `rate_limits`, `login_attempts`.
- Connections: `connections`.
- Servers: `servers`, `server_members`, `server_categories`, `server_channels`, `channel_messages`, `server_invites`, `server_roles`, `server_member_roles`, `server_role_mention_allow`, `channel_role_overrides`, `category_role_overrides`, `server_folders`, `server_emojis`, `channel_reads`, `server_notify_settings`, `server_bans`, `user_ips`.
- Bots: `bots`, `bot_tokens`, `bot_commands`, `bot_interactions`.
- Administration/observability: `admin_audit_log`, `app_events`, `metric_snapshots`.

RLS is enabled for these domain tables. Some have explicit read/write policies; sensitive internal tables intentionally have no client policies and are accessed through definer functions or the service role.

Migration `20260621000121_rls_hardening.sql` closes several earlier permissive paths:

- forged direct notification inserts;
- arbitrary conversation creation;
- adding oneself to any conversation and then reading its messages;
- globally readable device sessions;
- direct DM insertion that bypassed message guards and rate limits.

Most audited `SECURITY DEFINER` functions use `set search_path = public`. A historical missing `search_path` on `get_conversation_messages` was later replaced by a definition that includes it.

## Core feature flows

### Feed and posts

- The feed page obtains posts from `get_feed_posts` and maps rows through the posts feature.
- Post creation validates content and trusted attachment URLs, enforces a DB-backed rate limit and inserts under the authenticated user.
- Likes, reposts, reactions, views, comments and notifications are implemented with table operations and RPCs.
- Post and chat media use plan-dependent size limits; premium users can upload larger files.

### Direct messages and groups

- `/messages/[id]` resolves either a group public ID or another user's public ID.
- Existing DMs use a read-first `find_dm_conversation` path; missing DMs are created through advisory-locked `ensure_dm` to avoid duplicates.
- Initial messages come from `get_conversation_messages`, limited to the newest window and reordered chronologically.
- The client uses Realtime, optimistic messages, IndexedDB caching, read tracking, typing broadcasts and fallback polling.
- Server-side `sendDmViaServer` exists as a fallback when direct browser-to-Supabase calls fail.

### Server channels

- Server/channel pages resolve membership, channel permissions and age gates server-side.
- Channel messages are loaded by RPC, then updated through Realtime with polling as a safety net.
- Persistent unread state lives in `channel_reads`; `get_channel_unreads` is the authoritative source for per-channel counts and server-level aggregation.
- The current web client advances channel reads through `mark_channel_read_through(p_channel, p_message)`, introduced by `20260621000125_channel_read_boundaries.sql`. The RPC requires membership plus `READ_HISTORY`, validates that the boundary message belongs to the channel, advances the marker monotonically and clears only mentions at/before the effective boundary (plus legacy or dangling mentions whose message was deleted). Apply this migration before deploying the client change. The older `mark_channel_read(uuid)` remains for compatibility with older clients.
- `ChannelChat` submits only the latest rendered persisted message ID: optimistic `opt-*` IDs are excluded, hidden tabs do not advance reads, transient failures are retried while mounted, and `prosto:channel-read` is dispatched only after the RPC commits successfully.
- `ServerRail` discards out-of-order `get_channel_unreads` responses with a request-generation guard. `ServerSidebar` also suppresses a just-read channel while the authoritative state catches up; preserve both protections when changing unread behavior.
- DM and channel histories share `src/components/ui/chat-day-separator.tsx`. Calendar grouping renders deterministically in UTC for SSR/first hydration, switches to the viewer's timezone after mount, and breaks author grouping whenever the calendar day changes.
- Role and channel permissions are bitmasks implemented in SQL functions, with category/channel allow/deny overrides.
- Moderation includes ownership transfer, kick/remove, ban, timeout, unban and IP notes through guarded RPCs.

### Presence, notifications and calls

- Presence uses device sessions, heartbeat updates, broadcasts and last-seen state.
- Notifications include in-app counters, sound/toasts, favicon/desktop badges and optional Web Push.
- Calls are WebRTC-based and use chat/realtime signaling; call lifecycle messages are stored through guarded database functions.
- WebRTC ICE uses the existing public STUN servers plus a self-hosted coturn relay. Authenticated clients obtain one-hour coturn REST credentials from `GET /api/calls/turn-credentials`; the route derives them with HMAC-SHA1 from the server-only `TURN_SHARED_SECRET` and `TURN_HOST`. The shared secret never enters the browser bundle, responses are not cached, and calls fall back to STUN-only connectivity if TURN credential retrieval is unavailable.

### Search

- Search exists at both global application and contextual message levels.
- The project includes SQL message search plus a Next.js search API with query sanitization and rate limiting.

## Authentication and account handling

### Current auth flows

- Supabase password authentication.
- OAuth callback and first-login profile provisioning.
- Email OTP/code login.
- Password recovery by generated token-hash links.
- Desktop OAuth handoff through `prosto://` deep links and PKCE completion inside the webview.
- Password change, account deletion and global/other-session invalidation.
- Multi-account switching on one device.

### Multi-account token storage

Inactive accounts' Supabase refresh tokens are stored in one encrypted cookie:

- AES-256-GCM authenticated encryption;
- random IV per write;
- key derived from `ACCOUNT_STORE_SECRET` or the server-only Supabase service-role key;
- HttpOnly, Secure in production, SameSite=Lax;
- maximum five accounts;
- refresh-token rotation on account switch.

### Current auth limitations

- `EMAIL_CONFIRMATION_DISABLED` is set to `true` in `src/features/auth/api/actions.ts`. New password accounts are currently created through the admin API as pre-confirmed.
- `loginWithCode` and `requestPasswordReset` return a distinct `noAccount` field error for unknown addresses, contradicting comments that promise a generic response. This permits email/account enumeration.
- Turnstile verification intentionally fails open when no secret is configured and is bypassed in local development.
- MFA/TOTP/AAL2 support was not found. MFA is required by the Engineering Constitution but is not implemented.
- Login throttling is keyed only by normalized email. It slows brute force but allows an attacker to trigger temporary lockouts for a known address.

## Confirmed critical security issue

### Privilege escalation through the final `profiles` UPDATE policy

The repository's final migration state contains a critical RLS policy regression:

1. `20260621000092_pin_is_moderator_rls.sql` correctly pinned `is_verified`, `is_premium` and `is_moderator` during self-update.
2. `20260621000102_age_and_nsfw.sql` dropped and recreated the policy to pin birth date, but omitted `is_moderator`.
3. `20260621000122_admin_panel.sql` added `is_admin` without adding it to the self-update pin.
4. `20260621000123_bots.sql` added `is_bot` and `bot_owner_id`.
5. The latest `20260621000124_birth_date_pii_lockdown.sql` again recreates the policy and pins only `is_verified`, `is_premium` and `birth_date`.

The resulting policy permits an authenticated user to update their own profile row while failing to preserve `is_moderator`, `is_admin`, `is_bot` and `bot_owner_id`. The application expects authenticated profile updates to work, so the normal Supabase table UPDATE grant is part of the design. If this final policy is active in production, a user can potentially self-assign `is_admin = true`, after which admin RPC guards based on `is_admin(auth.uid())` trust the forged flag.

**Required remediation before treating the project as production-secure:**

- add a new forward migration; do not edit already-applied history;
- prevent authenticated clients from changing every privileged/system-owned profile column;
- preferably grant UPDATE only on an explicit allowlist of user-editable columns or route profile updates through a guarded RPC;
- retain the birth-date write-once behavior and column-level DOB privacy revoke;
- audit live profile rows for unauthorized `is_admin`, `is_moderator`, `is_verified`, `is_premium`, `is_bot` or ownership values after closing the policy;
- verify the actual live policy because applied production migration state was not inspected during this audit.

## Other security controls and risks

### Controls present

- HSTS, `nosniff`, frame restrictions, referrer policy and permissions policy are configured in Next.js.
- A nonce-based CSP is constructed per request.
- Relative post-auth redirects reject absolute URLs and protocol-relative `//` URLs.
- Spotify OAuth uses a random HttpOnly SameSite state cookie.
- Service-role imports are confined to server-oriented files and protected by `server-only` at the client definition.
- Bot privileged RPCs revoke execution from public/anon/authenticated and grant only to `service_role`.
- User text is rendered as React nodes; no general user-controlled `dangerouslySetInnerHTML` path was found.
- Upload routes authenticate, rate-limit, cap size and restrict renderable MIME types. SVG and HTML are excluded/forced opaque to reduce stored XSS risk.
- The service worker caches only same-origin static assets and does not cache navigations, APIs, auth or realtime traffic.
- Tauri updater metadata includes a public signing key.
- Tauri remote capabilities are restricted to `https://prosto.ink` and its subdomains.
- Local `.env`, `.env.local` and deploy secret files are ignored and were not tracked by Git at audit time.

### Risks to account for

- The full nonce CSP is sent as `Content-Security-Policy-Report-Only`; only the smaller header from `next.config.mjs` actively enforces `frame-ancestors`. The full policy currently reports but does not block XSS/resource violations.
- `productionBrowserSourceMaps` is enabled, exposing client source maps in production for debugging.
- Recovery and some OAuth origins are derived from `Host`, `x-forwarded-host` or `x-forwarded-proto` without a code-level host allowlist. Correct reverse-proxy normalization is therefore security-sensitive.
- Next and Go link-preview implementations validate DNS before fetching but do not pin the validated IP to the connection. A hostile DNS server may attempt DNS rebinding between validation and connection.
- OpenGraph images are rendered as direct browser `<img>` requests to third-party hosts. `referrerPolicy="no-referrer"` hides the page URL, but the remote host still observes the viewer's IP. The report-only CSP does not currently block arbitrary image hosts.
- OAuth avatar copying calls an external metadata-provided URL without the same SSRF guard, explicit timeout or streaming size limit before buffering.
- Several server-side external calls, including Spotify, Ataraxis, Resend, Turnstile and the in-process GIF fallback, do not consistently set an explicit timeout/retry policy.
- The CSP report endpoint logs the reported document URI. Avoid allowing sensitive query tokens to be persisted through CSP reports.
- Bot API rate limiting is process-local after token verification; it is suitable for one Node process but not a hard distributed limit.
- Uploads up to the premium ceiling are buffered in Node memory before S3 upload. This is deliberate for MinIO SigV4 compatibility but affects concurrent-memory capacity.

## Object storage

`src/lib/storage/` is the central server-only storage abstraction.

Logical buckets:

- `avatars` — profile banners/avatars and group avatars;
- `servers` — server assets, roles, themes, home assets and emojis;
- `posts` — post attachments;
- `chat` — DM and channel attachments.

Object keys include a user/domain prefix, timestamp and random suffix. Public URLs are path-style. Media objects default to one-year immutable caching because keys are unique. The upload route checks the declared content type against an allowlist and rechecks actual buffered size, but it does not perform full magic-byte/file-signature inspection.

## Bot platform

### API

Routes under `src/app/api/v1/` provide:

- bot identity;
- command registration/listing;
- message sending to a channel or conversation;
- long-poll interaction delivery;
- single-use interaction responses.

### Authentication

Token format: `pb_<token-row-id>.<random-secret>`.

- Secret material is 32 random bytes encoded as base64url.
- Plaintext is shown once and never stored.
- The database stores a SHA-256 hash with a server-side pepper/domain separator.
- Verification uses timing-safe comparison.
- Revoked tokens and inactive bots are rejected.
- Downstream bot RPCs recheck membership and permissions.

The `bot_tokens` owner SELECT policy is row-scoped but not column-scoped, so an owner can likely read `token_hash` directly. The hash is not usable without the high-entropy secret and server pepper, but hiding the column would improve defense in depth and align behavior with comments.

### SDK

`packages/prosto-bot` is an ESM TypeScript SDK targeting Node 18+. It wraps authentication, command synchronization, long polling, interaction contexts and message sending. It compiles in strict mode and emits declarations when built normally.

## Edge service

`services/edge` is optional and stateless:

- `GET /healthz` — liveness;
- `GET /gif` — Giphy search/trending proxy;
- `GET /link-preview` — OpenGraph/Twitter metadata extraction.

Next.js preserves authentication and per-IP rate limits before forwarding. If `EDGE_SERVICE_URL` is absent, unreachable or returns 5xx, the Next routes fall back to in-process implementations.

The edge link-preview code includes:

- HTTP(S)-only validation;
- restricted ports;
- private, loopback, link-local, CGNAT, ULA, multicast and metadata IP blocking;
- redirect revalidation;
- timeout, redirect count and response-size limits;
- bounded in-memory caching.

The edge service itself is unauthenticated and is intended to remain private/behind the same reverse proxy.

## Desktop application

The Tauri application is a thin remote client:

- main URL: `https://prosto.ink/feed`;
- local splash and offline fallback pages;
- custom frameless window controls;
- tray behavior and launch-at-login;
- native notifications and taskbar badges;
- chat/channel popout windows;
- OAuth return through the `prosto://auth` deep link;
- single-instance deep-link handling and duplicate-code protection;
- signed update feed from GitHub releases.

Remote native-command access is restricted by Tauri capabilities to the Prosto origin. Native commands validate relative popout paths and restrict external opening to HTTP(S).

Current desktop concerns:

- Tauri config reports CSP as unset for bundled content; the remote app relies on web-delivered headers, whose full CSP is currently report-only.
- `desktop-tauri/package.json`, Cargo metadata and Tauri config report version 2.0.1, but `desktop-tauri/package-lock.json` still identifies the root package as version 1.0.7.
- Native badge input has basic empty/dimension checks but no explicit maximum byte/dimension cap.

## PWA and notifications

`public/sw.js`:

- uses stale-while-revalidate only for same-origin static files;
- deliberately bypasses API, navigation, Supabase and realtime traffic;
- handles Web Push payloads and notification clicks;
- focuses/navigates an existing same-origin window where possible.

Web Push is optional and depends on VAPID configuration. In-app sounds and toasts remain available when push is unconfigured.

## Localization and UI architecture

- Locale resolution order: locale cookie, `Accept-Language`, default locale.
- RU and EN catalogs are statically imported for reliable production/dev behavior.
- Theme and platform style are global providers.
- Shared design settings live under `src/config` and Tailwind configuration.
- The icon layer aliases `lucide-react` to a project adapter backed primarily by Remix/Solar icons.

Observed divergence from the Engineering Constitution:

- 38 direct `@/features/...` imports were found across 22 files inside other feature directories, despite the rule that features should not directly depend on each other.
- Several UI modules contain orchestration and business/data logic together.
- `src/app/(app)/messages/[id]/chat-window.tsx` is approximately 2230 lines.
- `src/features/servers/server-settings.tsx` is approximately 849 lines.
- Other server/chat components are also several hundred lines long.

Do not perform broad refactors incidentally. When a task touches these areas, extract only cohesive behavior with tests or validation and preserve existing realtime semantics.

## Environment configuration

Environment access is centralized in `src/lib/utils/env.ts` and uses lazy getters. Missing required variables fail when the corresponding feature is accessed.

Known variable groups, without values:

- Supabase: public URL, anon key and server-only service-role key.
- TURN: server-only coturn hostname and REST authentication shared secret; credentials returned to browsers are generated dynamically and expire after one hour.
- Storage: S3 endpoint, region, access key ID, secret key, bucket and optional public storage URL.
- Spotify: client ID, client secret and optional explicit redirect URI.
- Ataraxis: optional partner API key and overridable API/web bases.
- Email: Resend API key and optional from address.
- Turnstile: optional site/secret configuration; server verification fails open when absent.
- Push: optional public/private VAPID keys and subject.
- Bots/accounts: optional dedicated token pepper and account-store encryption secret, with service-role-derived fallbacks.
- Edge: optional `EDGE_SERVICE_URL`; Go also reads its listen/environment settings and optional Giphy key.

At audit time `.env` and `.env.local` existed locally and were ignored by Git. No tracked `.env.example` was found, although the environment error text instructs developers to copy one.

## Local setup and startup

There is no single command that starts every subsystem. The normal web application uses externally configured Supabase and S3-compatible services; the optional Go edge service and Tauri shell are separate processes.

### Prerequisites

- Windows development is supported and was used for the audit.
- Use a current Node.js version compatible with Next.js 16 and the installed AWS SDK packages. Node 20+ is the safe baseline; Node 24.9.0 was used successfully during validation.
- npm is the package manager for the root web app and `desktop-tauri`.
- Rust/Cargo plus the Tauri platform prerequisites are required only for desktop development/builds.
- Go 1.22+ is required only for `services/edge`.
- Supabase, object-storage and integration configuration must be available in local environment files. No tracked `.env.example` currently exists.
- Do not commit `.env`, `.env.local`, signing keys, `deploy/secrets.ps1` or any credential material.

### Web application: development

From the repository root:

```powershell
npm ci
npm run dev
```

`npm run dev` runs `next dev --turbopack`. Next.js normally serves on `http://localhost:3000`; use the URL printed by Next if the port changes. The project also allows `127.0.0.1` as a development origin because some OAuth redirect configurations reject `localhost`.

The web process does **not** start a local Supabase database, object storage, email service or Go edge service. It connects to the services configured through the environment.

### Web application: local production mode

```powershell
npm ci
npm run type-check
npm run build
npm run start
```

- `npm run build` performs a production Next.js build and fails on TypeScript errors.
- `npm run start` serves the previously generated `.next` build.
- `npm run lint` is separate from `next build`; Next.js 16 does not run it automatically.
- At the 2026-07-22 audit snapshot, type-check and build passed, while lint had existing failures.

Useful root commands:

```powershell
npm run type-check
npm run lint
npm run lint:fix
npm run format
npm run admin -- <admin-script arguments>
```

Read `scripts/admin-user.mjs` before invoking the admin command; it can perform privileged account operations and requires server credentials.

### Optional Go edge service

From `services/edge` with Go 1.22+ installed:

```powershell
go run .
```

Default listen address: `127.0.0.1:8090`.

To make Next.js forward GIF and link-preview work to the service, configure the web server with:

```text
EDGE_SERVICE_URL=http://127.0.0.1:8090
```

Relevant edge variables:

- `EDGE_ADDR` — optional listen address override;
- `EDGE_ENV=production` — Gin release mode;
- `GIPHY_API_KEY` — optional; otherwise the code uses Giphy's public demo fallback.

Health check:

```text
GET http://127.0.0.1:8090/healthz
```

If the edge URL is unset or the service is unavailable/returns 5xx, the Next.js routes fall back to their in-process implementations.

### Tauri desktop development

From `desktop-tauri`:

```powershell
npm ci
npm run dev
```

Desktop development also requires Rust/Cargo, MSVC Build Tools and WebView2 on Windows. The Tauri application is a thin shell: its main window loads the deployed `https://prosto.ink/feed` application rather than a locally compiled copy of the Next.js frontend. The bundled `desktop-tauri/app` directory contains splash/offline assets.

Desktop build commands:

```powershell
npm run build       # platform-default Tauri bundles
npm run build:win   # NSIS on Windows
npm run build:mac   # DMG on macOS
npm run build:linux # AppImage on Linux
```

Release builds with updater artifacts require the configured Tauri signing key and password described below.

### Bot SDK

From `packages/prosto-bot`:

```powershell
npm install
npm run build
```

The build emits ESM JavaScript and declaration files to `dist`. For a no-output type validation from the repository environment, use:

```powershell
npx tsc -p packages/prosto-bot/tsconfig.json --noEmit
```

## Local release and GitHub publication script

The repository has a local PowerShell pipeline at `deploy/release.ps1`. The entire `deploy/` directory is gitignored, so this script and `deploy/secrets.ps1` are local tooling and are not included in private/public repository snapshots by normal Git staging.

`deploy/secrets.ps1`, when present, is dot-sourced by the release script and may provide local signing/GitHub credentials. Never read, print, copy, commit or document its values.

### Critical behavior warning

The script's mode without `-Confirm` is called a dry run only because it does not publish externally. It is **not a non-mutating preview**. A default invocation can:

- run web verification;
- auto-increment the desktop patch version;
- rewrite desktop version files;
- build and sign the desktop installer;
- generate `latest.json` and a stable installer copy;
- run `git add -A`;
- create a real local Git commit.

It stops only before GitHub Release creation and remote pushes. Inspect the working tree and branch before running even the non-confirmed mode.

### Preconditions for the full desktop pipeline

- Run from a PowerShell environment with `git` and `npm` on `PATH`.
- Desktop work additionally requires `gh`, `cargo`, Tauri prerequisites and a signing key at `%USERPROFILE%\.tauri\prosto.key`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` must be available or the script prompts securely for it.
- The working branch for live publication is `prod`.
- With `-Confirm`, the script refuses to push from any branch other than `prod`.
- Expected Git remotes:
  - `private` — `angelcorex/prostoprivate`, destination branch `main`;
  - `origin` — public `angelcorex/Prosto`, destination branch `main`.
- Desktop releases are published to `angelcorex/prostodesktop`.

### Common invocations

Local-only pipeline with an automatic patch bump:

```powershell
.\deploy\release.ps1
```

Full live release with an explicit version:

```powershell
.\deploy\release.ps1 -Version 2.1.0 -Confirm
```

Make lint a hard release gate:

```powershell
.\deploy\release.ps1 -Version 2.1.0 -Strict -Confirm
```

Web-only verification/commit/publication, skipping desktop build and GitHub desktop release:

```powershell
.\deploy\release.ps1 -SkipDesktop -Confirm -Message "release: web update"
```

Skip web verification while building the desktop release:

```powershell
.\deploy\release.ps1 -SkipWeb -Version 2.1.0 -Confirm
```

**Observed implementation detail:** `-SkipWeb` skips only the type-check/lint/build block. The common Git commit and push stages are outside that condition, so the current code can still stage, commit and push the repository when `-Confirm` is supplied. Do not interpret `-SkipWeb` as “no commit/push”.

### Actual release pipeline

Unless skipped by parameters, `deploy/release.ps1` performs:

1. **Preconditions**
   - checks tools, branch and signing key;
   - reads the current version from `desktop-tauri/src-tauri/tauri.conf.json`;
   - uses the explicit `-Version` or increments the patch component.
2. **Web verification**
   - `npm run type-check` — hard failure;
   - `npm run lint` — advisory by default, hard failure with `-Strict`;
   - `npm run build` — hard failure.
3. **Desktop version update**
   - updates `desktop-tauri/src-tauri/tauri.conf.json`;
   - updates `desktop-tauri/src-tauri/Cargo.toml`;
   - updates `desktop-tauri/package.json`.
4. **Signed Windows desktop build**
   - clears previous NSIS artifacts;
   - runs `npm run build:win`;
   - requires both a `*-setup.exe` and adjacent `.sig` file.
5. **Updater manifest/assets**
   - creates `latest.json` for `windows-x86_64`;
   - copies the installer to stable asset name `Prosto-Setup.exe`;
   - updater URL points to the versioned GitHub Release asset.
6. **Desktop GitHub Release — only with `-Confirm`**
   - creates tag/release `v<Version>` in `angelcorex/prostodesktop`;
   - uploads `Prosto-Setup.exe`, the signature and `latest.json`.
7. **Local Git commit**
   - runs `git add -A`, so every unignored change in the repository can be staged, not only release/version files;
   - commits with `-Message` or default `release: desktop v<Version>`;
   - includes the fixed co-author trailer currently hardcoded in the script.
8. **Private push — only with `-Confirm`**
   - pushes local `prod` to `private/main` with full history;
   - this push triggers the VPS GitHub Actions deployment.
9. **Public snapshot — only with `-Confirm`**
   - creates a commit from the current tree using `git commit-tree` without transferring private branch history;
   - parents it onto the existing public `origin/main` tip when possible;
   - pushes the snapshot to public `origin/main`;
   - if histories diverge and the normal push is rejected, the script retries the public snapshot with `--force`.

### Version-file caveat

The release script updates three desktop version files but does **not** update `desktop-tauri/package-lock.json`. This explains the observed root lockfile version mismatch and should be considered when changing the release pipeline. Keep all package metadata consistent or deliberately document why the lockfile root version may lag.

### External effects of `-Confirm`

`-Confirm` is a high-impact switch. It can perform all of the following in one run:

- publish a signed desktop installer and updater manifest to GitHub Releases;
- push full private history to `private/main`;
- trigger the production VPS web deployment;
- publish the current source tree as a public snapshot;
- force-update the public branch if its history diverged.

Before using it, verify the branch, staged/untracked files, target version, commit message, remotes, signing configuration and whether database migrations must be applied manually. The script does not apply Supabase migrations.

## Deployment model

`.github/workflows/deploy.yml` runs on pushes to `main` or manually:

1. SSH to the VPS.
2. Reset the server checkout to `origin/main`.
3. Run `npm ci`.
4. Run `npm run build`.
5. Restart or create the PM2 `prosto` process.
6. Save PM2 state.

Important limitations:

- the workflow does not run lint, tests, dependency audit or a separate explicit type-check;
- Next build does perform TypeScript validation;
- the workflow explicitly does not apply Supabase migrations;
- database migrations are expected to be applied manually;
- two migration files share version prefix `20260621000101` (`invite_max_uses` and `message_search`), which can conflict with migration-history tooling expecting unique versions;
- deployment and database migration order can therefore drift.

## Validation snapshot from 2026-07-22

### Passed

- `npm run type-check` — passed.
- `npm run build` — passed with Next.js 16.2.10; the build compiled, type-checked, generated 54 static-page entries and emitted the route map.
- `npx tsc -p packages/prosto-bot/tsconfig.json --noEmit` — passed.
- `cargo check --locked` in `desktop-tauri/src-tauri` — passed.
- `cargo test --locked -j 1` — passed; there are zero Rust tests.
- `npx tauri info` — recognized Windows, WebView2, MSVC, Rust, Cargo and Tauri configuration.
- Desktop npm audit — zero reported vulnerabilities.

### Failed or incomplete

- `npm run lint` — failed with **42 findings: 12 errors and 30 warnings**. Main categories:
  - unapproved explicit `any`;
  - missing React hook dependencies and ref-cleanup warnings;
  - unused imports, variables and parameters.
- No JavaScript/TypeScript test files or Vitest/Jest/Playwright configuration were found.
- Rust test harness contains zero tests.
- Go compilation/tests were not run because Go was absent from PATH, Docker was absent and no WSL distribution was installed in the audit environment.
- No end-to-end browser test, live Supabase test, object-storage test, email test, Web Push test or production smoke test was performed.

### Dependency audit

Root `npm audit` reported:

- 5 total findings: 4 high, 1 moderate;
- production-only audit: 3 findings, comprising the direct Next package's aggregate high status through vulnerable transitive `sharp` (high) and bundled `postcss` (moderate);
- the audit did not provide an automatic fix for the Next aggregate at that time;
- additional full-tree findings in `brace-expansion` and `js-yaml` are associated with tooling/dev dependencies.

Re-run the audit before dependency work because advisory results change over time.

## Known operational and maintainability debt

Prioritized repository issues:

1. **P0:** repair the final `profiles` self-update policy and audit live privileged flags.
2. **P1:** resolve production dependency advisories, especially image-processing exposure through `sharp`.
3. **P1:** restore verified email confirmation or explicitly redesign the registration trust model.
4. **P1:** remove account enumeration from code-login and password-reset flows.
5. **P1:** validate canonical origins rather than trusting forwarded host headers blindly.
6. **P1:** introduce automated tests for auth/RLS, messaging permissions, server permissions and critical RPCs.
7. **P2:** make the full CSP enforcing after resolving report violations.
8. **P2:** regenerate Supabase database types and reduce `any` at database boundaries.
9. **P2:** fix lint errors and hook warnings.
10. **P2:** make migration versions unique and automate/verify migration deployment order.
11. **P2:** align Next and ESLint config major versions and desktop package/lock versions.
12. **P2:** add explicit timeouts and safe retry policies to external server requests.
13. **P2:** gradually reduce cross-feature coupling and oversized components without breaking realtime behavior.

## Required validation guidance for future changes

Choose checks based on scope:

- Web logic/UI: `npm run type-check`, targeted tests when available, `npm run lint`, and `npm run build` for route/config/server changes.
- SQL/RLS: review as an attacker with the anon/authenticated roles; test direct PostgREST access, RPC authorization, grants and negative cases in a disposable Supabase environment.
- Bot SDK: `npx tsc -p packages/prosto-bot/tsconfig.json --noEmit` and package build/consumer smoke test.
- Edge Go: `go test ./...` and a link-preview SSRF test matrix once Go is available.
- Tauri: `cargo check --locked`, `cargo test --locked -j 1`, Tauri config inspection and platform packaging when release behavior changes.
- Uploads: test MIME spoofing, size boundaries, unauthenticated access, rate limits and storage cleanup.
- Realtime code: verify subscription cleanup, duplicate reconciliation, account switching and fallback polling.

Do not report the project as fully tested or production-secure solely because the Next production build passes.

## Final working model

The dominant architecture is **Next.js server-rendered application + direct Supabase browser realtime + PostgreSQL RPC/RLS business layer**, with S3 media storage, an optional Go offload service and a thin Tauri shell. Most security-sensitive behavior ultimately depends on PostgreSQL policies/functions rather than Next.js UI. Any change involving identity, profiles, messages, servers, permissions, privacy, admin, bots or age data must therefore be reviewed at both the application layer and the final database-grant/RLS layer.
