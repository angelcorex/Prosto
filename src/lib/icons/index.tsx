/*
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  CENTRAL ICON REGISTRY — the single source of truth for every icon.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The whole app imports icons from `lucide-react`. The build aliases
 * `lucide-react` to THIS module (see next.config.mjs), so every existing
 * `<Hash className="h-4 w-4" />` call-site keeps working unchanged — it just
 * renders a different glyph now.
 *
 * Primary source ........ Solar Icons  (@solar-icons/react)  → https://solar-icons.vercel.app
 * Fallback source ....... Remix Icon font (`ri-*`)           → for glyphs Solar has no equivalent for
 *
 * ── HOW TO SWAP AN ICON ──────────────────────────────────────────────────────
 *   • To Solar   : `export const Foo = solar(SolarComponentName);`
 *   • To Remix   : `export const Foo = remix('ri-foo-line', 'ri-foo-fill');`
 *   • Force solid: `export const Foo = solar(Name, { weight: 'Bold' });`
 *
 * Sizing follows the Tailwind `h-*`/`w-*` classes on the call-site (Solar icons
 * are <svg>, so CSS width/height wins), and colour follows `text-*`
 * (`currentColor`). A `fill-*` utility (e.g. a liked heart) auto-upgrades a
 * Solar icon to its filled `Bold` weight — matching the old line→solid switch.
 *
 * ── WHY SOME ICONS STAY ON REMIX ─────────────────────────────────────────────
 * Solar is a "framed" UI set: it ships no bare glyphs for the primitives
 * (plain +, −, ✕, ✓), no brand marks (Apple/GitHub/Google/Discord), and no
 * spinner / mic-off / pin-off / signal / empty-square. Those keep the Remix
 * font so the UI primitives stay crisp; everything else is Solar.
 */
import type { CSSProperties, ComponentType, HTMLAttributes } from 'react';
import {
  // arrows
  ArrowLeft as SArrowLeft, ArrowRight as SArrowRight,
  AltArrowDown, AltArrowUp, SquareArrowRightUp, Refresh,
  // arrows-action
  DownloadMinimalistic as SDownload, Login2 as SLogin2,
  Maximize as SMaximize, Minimize as SMinimize, UndoLeftRound,
  // ui
  DangerTriangle, ForbiddenCircle, CheckCircle as SCheckCircle, CloseCircle,
  Copy as SCopy, Crown as SCrown, QuestionCircle, InfoCircle, Home as SHome,
  MenuDots, Pin as SPin, Share as SShare, MagicStick3, TrashBinMinimalistic, Cup,
  // security
  Eye as SEye, EyeClosed, Lock as SLock, Shield as SShield, ShieldCross,
  ShieldMinimalistic,
  // time
  Calendar, ClockCircle, Stopwatch,
  // video
  Camera as SCamera, Clapperboard, Gallery, GalleryAdd, Microphone, Play as SPlay,
  Pause as SPause, Repeat as SRepeat, VolumeLoud, VolumeCross,
  // notifications
  Bell as SBell, BellOff as SBellOff,
  // messages
  ChatRound, ChatSquare, ChatDots, ForwardRight, Paperclip as SPaperclip, Pen, Plain,
  // map
  CompassBig as SCompassBig, Global,
  // building
  HomeSmileAngle as SHomeSmileAngle,
  // search
  Magnifier, MagnifierZoomIn, MagnifierZoomOut,
  // text-formatting
  Eraser as SEraser, Link as SLink, LinkBroken, LinkMinimalistic2,
  // folders / files
  Folder as SFolder, AddFolder, FileText as SFileText,
  // it
  Hashtag, Code2,
  // devices
  HeadphonesRound, Monitor as SMonitor, Server as SServer, Smartphone as SSmartphone,
  // settings
  Settings as SSettings, Tuning,
  // money
  VerifiedCheck, Tag as STag,
  // faces / like / weather
  SmileCircle, StickerSmileSquare, Heart as SHeart, Star as SStar,
  Moon as SMoon, Sun as SSun,
  // users
  User as SUser, UserCheck as SUserCheck, UserCircle as SUserCircle,
  UserMinus as SUserMinus, UserPlus as SUserPlus, UsersGroupRounded,
  // tools / call
  Palette as SPalette, Phone as SPhone, EndCall,
} from '@solar-icons/react';
import type { IconWeight } from '@solar-icons/react';

import { cn } from '@/lib/utils/cn';

export interface IconProps extends HTMLAttributes<HTMLElement> {
  className?: string;
  /** Explicit glyph size in px; overrides the `h-*` utility inference. */
  size?: number | string;
  /** Accepted for lucide API parity — ignored (Solar uses `weight`, not stroke). */
  strokeWidth?: number;
  fill?: string;
  color?: string;
}

export type LucideIcon = (props: IconProps) => React.JSX.Element;

/* ─────────────────────────────────────────────────────────────────────────
 * Solar renderer
 * ───────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SolarComponent = ComponentType<any>;

interface SolarOpts {
  /** Force a weight always (e.g. inherently-solid Play/Pause, or badges). */
  weight?: IconWeight;
  /** Extra classes baked in (e.g. `rotate-90` to turn horizontal dots vertical). */
  extra?: string;
  /** Horizontally mirror the glyph (e.g. reply = a mirrored forward arrow). */
  mirror?: boolean;
}

// Solar glyphs sit a touch smaller inside their 24px box than the old font
// icons, so bump every icon up ~10% globally. Tune here to resize the whole
// set at once. Mirrored icons fold the flip into the same transform (a CSS
// `scale` would otherwise override Solar's built-in mirror attribute).
const SOLAR_SCALE = 'scale-110';
// Mirror + the same 10% bump via standard Tailwind scale utilities (they feed
// the shared transform var chain, so the flip survives and composes cleanly).
const SOLAR_SCALE_MIRROR = '-scale-x-110 scale-y-110';

/** Wrap a Solar icon so it honours the lucide call-site API (className sizing,
 *  `text-*` colour, `size`, and line→solid on a `fill-*` utility). */
function solar(Comp: SolarComponent, opts: SolarOpts = {}): LucideIcon {
  function Icon({ className, size, strokeWidth: _sw, fill: _fill, color, style, ...rest }: IconProps) {
    // Solar renders in its filled `Bold` weight by default (the app's chosen
    // look). Pass `opts.weight` to force a different weight for a specific icon.
    const weight: IconWeight = opts.weight ?? 'Bold';
    const resolvedStyle: CSSProperties | undefined = style;
    return (
      <Comp
        aria-hidden="true"
        weight={weight}
        {...(size != null ? { size } : {})}
        {...(color ? { color } : {})}
        {...rest}
        style={resolvedStyle}
        className={cn('inline-block shrink-0', opts.mirror ? SOLAR_SCALE_MIRROR : SOLAR_SCALE, opts.extra, className)}
      />
    );
  }
  Icon.displayName = `Solar(${(Comp as { displayName?: string }).displayName ?? 'icon'})`;
  return Icon;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Remix Icon font renderer — fallback for glyphs Solar doesn't ship.
 * ───────────────────────────────────────────────────────────────────────── */

/** Maps Tailwind `h-*` sizing utilities to a matching glyph font-size (px). */
const SIZE_PX: Record<string, number> = {
  'h-2': 8, 'h-2.5': 10, 'h-3': 12, 'h-3.5': 14, 'h-4': 16, 'h-4.5': 18,
  'h-5': 20, 'h-6': 24, 'h-7': 28, 'h-8': 32, 'h-9': 36, 'h-10': 40,
  'h-11': 44, 'h-12': 48, 'h-14': 56, 'h-16': 64,
};

function remix(line: string, solid?: string): LucideIcon {
  function Icon({ className, size, strokeWidth: _sw, fill: _f, color, style, ...rest }: IconProps) {
    const cls = className ?? '';
    const useSolid = solid && /(?:^|\s)fill-(?!none\b)/.test(cls);
    const glyph = useSolid ? (solid as string) : line;

    let fontSize: string | number | undefined = size;
    if (fontSize == null) {
      const tokens = cls.split(/\s+/);
      const key = tokens.find((c) => c in SIZE_PX);
      if (key) {
        fontSize = SIZE_PX[key];
      } else {
        const arbitrary = tokens.find((c) => /^h-\[[\d.]+(px|rem|em)\]$/.test(c));
        if (arbitrary) fontSize = arbitrary.slice(3, -1);
      }
    }
    const resolvedStyle = {
      ...(fontSize != null ? { fontSize: typeof fontSize === 'number' ? `${fontSize}px` : fontSize } : null),
      ...(color ? { color } : null),
      ...style,
    };

    return (
      <i
        aria-hidden="true"
        {...rest}
        style={resolvedStyle}
        className={cn(glyph, 'inline-flex shrink-0 items-center justify-center not-italic leading-none', className)}
      />
    );
  }
  Icon.displayName = `Ri(${line})`;
  return Icon;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MAPPING: lucide export name → icon source
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Solar (primary) ── */
export const AlertTriangle     = solar(DangerTriangle);
export const ArrowLeft         = solar(SArrowLeft);
export const ArrowRight        = solar(SArrowRight);
export const BadgeCheck        = solar(VerifiedCheck, { weight: 'Bold' });
export const Ban               = solar(ForbiddenCircle);
export const Bell              = solar(SBell);
export const BellOff           = solar(SBellOff);
export const CalendarDays      = solar(Calendar);
export const Camera            = solar(SCamera);
export const CheckCircle       = solar(SCheckCircle);
export const ChevronDown       = solar(AltArrowDown);
export const ChevronRight      = remix('ri-arrow-right-s-line');
export const ChevronUp         = solar(AltArrowUp);
export const Clock             = solar(ClockCircle);
export const Copy              = solar(SCopy);
export const Compass           = solar(SCompassBig);
export const CornerUpLeft      = solar(ForwardRight, { mirror: true });
export const CornerUpRight     = solar(ForwardRight);
export const Crown             = solar(SCrown);
export const Download          = solar(SDownload);
export const Eraser            = solar(SEraser);
export const ExternalLink      = solar(SquareArrowRightUp);
export const Eye               = solar(SEye);
export const EyeOff            = solar(EyeClosed);
export const Film              = solar(Clapperboard);
export const Folder            = solar(SFolder);
export const FolderPlus        = solar(AddFolder);
export const Globe             = solar(Global);
export const Forward           = solar(ForwardRight);
export const Hash              = solar(Hashtag);
export const HeadphoneOff      = solar(VolumeCross);
export const Headphones        = solar(HeadphonesRound);
export const HelpCircle        = solar(QuestionCircle);
export const Heart             = solar(SHeart);
export const Home              = solar(SHome);
export const House             = solar(SHomeSmileAngle, { weight: 'Bold' });
export const Image             = solar(Gallery);
export const ImageIcon         = solar(Gallery);
export const ImagePlus         = solar(GalleryAdd);
export const Info              = solar(InfoCircle);
export const Link2             = solar(SLink);
export const Link2Off          = solar(LinkBroken);
export const LogOut            = solar(SLogin2, { weight: 'Bold' });
export const Lock              = solar(SLock);
export const MessageCircle     = solar(ChatRound);
export const MessageSquareText = solar(ChatSquare);
export const MessagesSquare    = solar(ChatDots);
export const Mic               = solar(Microphone);
export const Monitor           = solar(SMonitor);
export const Moon              = solar(SMoon);
export const Menu              = remix('ri-menu-line');
export const Slash             = remix('ri-slash-commands-2');
export const MoreHorizontal    = solar(MenuDots);
export const MoreVertical      = solar(MenuDots, { extra: 'rotate-90' });
export const Palette           = solar(SPalette);
export const Paperclip         = solar(SPaperclip);
export const Pencil            = solar(Pen);
export const Phone             = solar(SPhone);
export const PhoneOff          = solar(EndCall, { weight: 'Bold' });
export const Pin               = solar(SPin);
export const Play              = solar(SPlay, { weight: 'Bold' });
export const FileText          = solar(SFileText);
export const Repeat            = solar(SRepeat);
export const Repeat2           = solar(UndoLeftRound);
export const Reply             = solar(ForwardRight, { mirror: true });
export const RotateCw          = solar(Refresh);
export const Search            = solar(Magnifier);
export const Send              = solar(Plain, { weight: 'Bold' });
export const Server            = solar(SServer);
export const Settings          = solar(SSettings);
export const Settings2         = solar(Tuning);
export const Share             = solar(SShare);
export const Share2            = solar(LinkMinimalistic2);
export const ShieldOff         = solar(ShieldCross);
export const Shield            = solar(SShield);
export const Smile             = solar(SmileCircle);
export const Smartphone        = solar(SSmartphone);
export const Sparkles          = solar(MagicStick3);
export const Star              = solar(SStar);
export const SlidersHorizontal = solar(Tuning);
export const Sticker           = solar(StickerSmileSquare);
export const Sun               = solar(SSun);
export const Terminal          = solar(Code2);
export const Tag               = solar(STag);
export const Timer             = solar(Stopwatch);
export const Trash2            = solar(TrashBinMinimalistic);
export const Trophy            = solar(Cup);
export const User              = solar(SUser);
export const UserCheck         = solar(SUserCheck);
export const UserCircle        = solar(SUserCircle);
export const UserMinus         = solar(SUserMinus);
export const UserPlus          = solar(SUserPlus);
export const Users             = solar(UsersGroupRounded);
export const XCircle           = solar(CloseCircle);
export const ZoomIn            = solar(MagnifierZoomIn);
export const ZoomOut           = solar(MagnifierZoomOut);
export const Maximize2         = solar(SMaximize);
export const Minimize2         = solar(SMinimize);
export const Pause             = solar(SPause, { weight: 'Bold' });
export const Volume2           = solar(VolumeLoud, { weight: 'Bold' });
export const VolumeX           = solar(VolumeCross, { weight: 'Bold' });

/* ── Remix font (fallback — Solar ships no equivalent) ── */
// Bare primitives (Solar only has circle/square-framed variants):
export const Check             = remix('ri-check-line');
export const CheckCheck        = remix('ri-check-double-line');
export const Plus              = remix('ri-add-line');
export const Minus             = remix('ri-subtract-line');
export const X                 = remix('ri-close-line');
export const Square            = remix('ri-checkbox-blank-line');
export const AtSign            = remix('ri-at-line');
// State glyphs Solar lacks:
export const Loader2           = remix('ri-loader-4-line');
export const MicOff            = remix('ri-mic-off-line');
export const PinOff            = remix('ri-unpin-line');
export const Signal            = remix('ri-signal-tower-line', 'ri-signal-tower-fill');
// Brand marks (Solar is a UI set — no logos):
export const Apple             = remix('ri-apple-fill');
export const Github            = remix('ri-github-fill');
export const Google            = remix('ri-google-fill');
export const Discord           = remix('ri-discord-fill');

/* ═══════════════════════════════════════════════════════════════════════════
 * BADGE ICONS — verification / moderator / verified-server.
 * Centralised here so swapping the badge glyph is a one-line change. Colour is
 * applied by the badge component via a `text-*` class (currentColor).
 * ═══════════════════════════════════════════════════════════════════════════ */
export const VerifiedIcon       = solar(VerifiedCheck, { weight: 'Bold' });
export const ModeratorIcon      = solar(ShieldMinimalistic, { weight: 'Bold' });
// Server uses the same new check as accounts (just tinted lighter by the badge).
export const ServerVerifiedIcon = solar(VerifiedCheck, { weight: 'Bold' });
