'use client';

/*
 * Colourful mockups of the product surfaces, arranged as a bento collage on the
 * landing. Colour comes from tints/gradients on avatars and accents; the panels
 * themselves stay dark to sit on the #111111 page. All visible copy is
 * localised (home namespace + reused servers namespace for the discovery mock).
 */
/* eslint-disable @next/next/no-img-element */
import { Heart, MessageCircle, Repeat2, Share2, Eye, Compass, BadgeCheck, CheckCheck, ServerVerifiedIcon } from '@/lib/icons';
import { useT } from '@/providers/i18n-provider';

/** Avatar — a real image when `src` is given, else a coloured gradient initial. */
function Avatar({ initial, from, src, size = 'h-9 w-9' }: { initial: string; from: string; src?: string; size?: string }) {
  if (src) {
    return (
      <span className={`${size} inline-block shrink-0 overflow-hidden rounded-full align-middle`}>
        <img src={src} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white`}
      style={{ background: from }}
    >
      {initial}
    </span>
  );
}

const panel = 'w-full rounded-2xl border border-white/[0.08] bg-[#0e0e0e]';

/* Feed post ------------------------------------------------------------- */

export function FeedPreview() {
  const t = useT('home');
  return (
    <div className={`${panel} p-5`}>
      <div className="flex items-start gap-3">
        <Avatar initial="M" from="linear-gradient(135deg,#7c5cff,#a78bfa)" src="/preview/mira.webp" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-white">Mira</span>
            <BadgeCheck className="h-4 w-4 text-sky-400" />
            <span className="text-[13px] text-white/40">@mira · 2m</span>
          </div>
          <p className="mt-1 text-[14px] leading-relaxed text-white/80">
            {t('previewFeedText')}
          </p>
          <div className="mt-3 h-44 w-full overflow-hidden rounded-xl ring-1 ring-white/10">
            <img src="/preview/picture.jpg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="mt-3 flex items-center gap-5 text-white/40">
            <span className="flex items-center gap-1.5 text-[13px]"><Heart className="h-[17px] w-[17px] fill-current text-rose-500" /> 248</span>
            <span className="flex items-center gap-1.5 text-[13px]"><MessageCircle className="h-[17px] w-[17px]" /> 31</span>
            <span className="flex items-center gap-1.5 text-[13px]"><Repeat2 className="h-[17px] w-[17px]" /> 57</span>
            <Share2 className="h-[17px] w-[17px]" />
            <span className="ml-auto flex items-center gap-1 text-[12px] text-white/30"><Eye className="h-[14px] w-[14px]" /> 12.4k</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Server discovery ------------------------------------------------------ */

interface DiscoverServer {
  name: string;
  icon: string;
  banner: string;
  descKey: string;
  online: string;
  members: string;
  verified?: boolean;
}

const DISCOVER_SERVERS: DiscoverServer[] = [
  { name: 'Minecraft',       icon: '/preview/minecraft_icon.webp',     banner: '/preview/minecraft_banner.jpg',     descKey: 'previewMinecraftDesc', online: '18.2k', members: '1.2M', verified: true },
  { name: 'Hytale',          icon: '/preview/hytale_icon.webp',        banner: '/preview/hytale_banner.jpg',        descKey: 'previewHytaleDesc',    online: '9.4k',  members: '540k', verified: true },
  { name: 'OpenAI',          icon: '/preview/openai_icon.webp',        banner: '/preview/openai_banner.jpg',        descKey: 'previewOpenaiDesc',    online: '24.7k', members: '2.1M', verified: true },
  { name: 'World Of Walker', icon: '/preview/worldofwalker_icon.webp', banner: '/preview/worldofwalker_banner.jpg', descKey: 'previewWalkerDesc',    online: '6.8k',  members: '310k', verified: true },
];

/** Discover-servers mock — mirrors the real in-app discovery cards. */
export function ServerPreview() {
  const t = useT('home');
  const ts = useT('servers');
  return (
    <div className={`${panel} h-full p-5`}>
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#7c5cff]/15 text-[#b7a6ff]">
          <Compass className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[16px] font-bold text-white">{ts('discoverTitle')}</p>
          <p className="text-[13px] text-white/40">{ts('discoverSubtitle')}</p>
        </div>
      </div>

      {/* Fake search + tabs */}
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white/30 ring-1 ring-white/[0.06]">
        {ts('discoverSearchPlaceholder')}
      </div>
      <div className="mt-3 flex items-center gap-1 text-[13px]">
        <span className="rounded-lg bg-white/[0.08] px-3 py-1.5 font-medium text-white">{ts('discoverPopular')}</span>
        <span className="rounded-lg px-3 py-1.5 text-white/40">{ts('discoverNew')}</span>
        <span className="rounded-lg px-3 py-1.5 text-white/40">{ts('discoverSmall')}</span>
      </div>

      {/* Server cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DISCOVER_SERVERS.map((s) => (
          <div key={s.name} className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="relative h-16 w-full bg-white/[0.04]">
              <img src={s.banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <div className="flex flex-1 flex-col p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="-mt-2 h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-[#0e0e0e] ring-4 ring-[#0e0e0e]">
                  <img src={s.icon} alt={s.name} className="h-full w-full object-cover" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[14px] font-bold text-white">
                    {s.verified && <ServerVerifiedIcon className="h-4 w-4 shrink-0 text-sky-300" />}
                    <span className="truncate">{s.name}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-3 text-[11px] text-white/40">
                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{s.online}</span>
                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/30" />{s.members}</span>
                  </p>
                </div>
              </div>
              <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-white/60">{t(s.descKey)}</p>
              <div className="mt-3 rounded-lg bg-white/[0.06] py-2 text-center text-[13px] font-medium text-white/80">{ts('discoverOpen')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Direct messages ------------------------------------------------------- */

export function MessagesPreview() {
  const t = useT('home');
  const green = 'linear-gradient(135deg,#34d399,#22d3ee)';
  const purple = 'linear-gradient(135deg,#7c5cff,#a78bfa)';
  const alex = '/preview/alexriva.jpg';
  const you = '/preview/you.jpg';
  const msgs = [
    { i: 'A', from: green,  src: alex, n: 'Alex Rivera',    time: '2:14', text: t('previewMsg1'), me: false },
    { i: 'Y', from: purple, src: you,  n: t('previewYou'),  time: '2:15', text: t('previewMsg2'), me: true },
    { i: 'A', from: green,  src: alex, n: 'Alex Rivera',    time: '2:15', text: t('previewMsg3'), me: false },
  ];
  return (
    <div className={`${panel} p-5`}>
      {/* Conversation header — status dot on the avatar + status label */}
      <div className="mb-4 flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <span className="relative inline-flex">
          <Avatar initial="A" from={green} src={alex} />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-[#0e0e0e]" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-white">Alex Rivera</p>
          <p className="text-[12px] text-white/40">{t('previewOnline')}</p>
        </div>
      </div>

      {/* Flat message list (Discord-style: avatar + name + plain text) */}
      <div className="flex flex-col gap-4">
        {msgs.map((m, idx) => (
          <div key={idx} className="flex gap-3">
            <Avatar initial={m.i} from={m.from} src={m.src} size="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-white">{m.n}</span>
                <span className="text-[11px] text-white/35">{m.time}</span>
              </div>
              <div className="flex items-end gap-1.5">
                <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-white/80">{m.text}</p>
                {m.me && <CheckCheck className="mb-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
