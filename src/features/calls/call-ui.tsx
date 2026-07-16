'use client';

import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Phone, PhoneOff, Mic, MicOff, Headphones, HeadphoneOff, Signal } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { VerifiedBadge } from '@/components/ui';
import { useT } from '@/providers/i18n-provider';
import type { CallState } from './use-call';

interface CallUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
}

interface CallUIProps {
  state: CallState;
  otherUser: CallUser | null;
  me: CallUser | null;
  muted: boolean;
  deafened: boolean;
  remoteMuted: boolean;
  remoteDeafened: boolean;
  remotePresent: boolean;
  localLevel: number;
  remoteLevel: number;
  callSeconds: number;
  latency: number | null;
  onAccept: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function quality(latency: number | null): { key: 'connecting' | 'qualityGood' | 'qualityMedium' | 'qualityPoor'; color: string } {
  if (latency == null)   return { key: 'connecting',    color: 'text-muted-foreground' };
  if (latency < 50)      return { key: 'qualityGood',   color: 'text-success' };
  if (latency < 120)     return { key: 'qualityMedium', color: 'text-warning' };
  return { key: 'qualityPoor', color: 'text-destructive' };
}

/* ── Avatar with green pulse aura + mute/deafen badges above ── */
function CallAvatar({
  user, level, connected, muted, deafened, size = 104,
}: {
  user: CallUser | null; level: number; connected: boolean; muted: boolean; deafened: boolean; size?: number;
}) {
  const name    = user?.display_name ?? user?.username ?? '?';
  const initial = name[0]?.toUpperCase() ?? '?';
  const aura     = connected ? level : 0;
  const speaking = aura > 0.05;

  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.7, height: size * 1.7 }}>

      {/* Ripple rings (behind avatar) */}
      {speaking && (
        <>
          <span
            className="call-ripple absolute rounded-full"
            style={{
              width: size, height: size,
              background: `radial-gradient(circle, hsl(var(--success) / ${0.5 * aura}) 0%, hsl(var(--success) / ${0.2 * aura}) 50%, transparent 72%)`,
              animationDuration: `${1.8 - aura}s`,
            }}
          />
          <span
            className="call-ripple absolute rounded-full"
            style={{
              width: size, height: size,
              background: `radial-gradient(circle, hsl(var(--success) / ${0.35 * aura}) 0%, transparent 70%)`,
              animationDuration: `${1.8 - aura}s`,
              animationDelay: '0.6s',
            }}
          />
          <span
            className="absolute rounded-full"
            style={{
              width: size * 1.25, height: size * 1.25,
              background: `radial-gradient(circle, hsl(var(--success) / ${0.45 * aura}) 0%, transparent 68%)`,
              transform: `scale(${1 + aura * 0.45})`,
              filter: 'blur(2px)',
            }}
          />
        </>
      )}

      {/* Avatar */}
      <div
        className={cn(
          'relative z-10 overflow-hidden rounded-full bg-link/20 transition-all duration-150',
          speaking && 'ring-2 ring-success',
          !connected && 'grayscale opacity-50',
        )}
        style={{ width: size, height: size }}
      >
        {user?.avatar_url ? (
          <AvatarImage src={user.avatar_url} alt={name} sizes={`${size}px`} className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-link">{initial}</span>
        )}
      </div>

      {/* Status badges — ABOVE the avatar */}
      {(muted || deafened) && (
        <div className="absolute z-20 flex gap-1" style={{ top: size * 0.18 }}>
          {deafened ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive ring-2 ring-card">
              <HeadphoneOff className="h-4 w-4 text-white" />
            </span>
          ) : muted ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive ring-2 ring-card">
              <MicOff className="h-4 w-4 text-white" />
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CallButton({
  variant, onClick, title, children,
}: {
  variant: 'mute' | 'muted' | 'accept' | 'end';
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    mute:   'bg-[#3a3c43] text-white hover:bg-[#45474f]',
    muted:  'bg-[#f23f43] text-white hover:bg-[#d93337]',
    accept: 'bg-[#23a55a] text-white hover:bg-[#1e9150]',
    end:    'bg-[#f23f43] text-white hover:bg-[#d93337]',
  };
  return (
    <button onClick={onClick} title={title}
      className={cn('flex h-11 items-center justify-center rounded-xl transition-colors', styles[variant])}>
      {children}
    </button>
  );
}

export function CallUI({
  state, otherUser, me, muted, deafened, remoteMuted, remoteDeafened, remotePresent,
  localLevel, remoteLevel, callSeconds, latency,
  onAccept, onEnd, onToggleMute, onToggleDeafen,
}: CallUIProps) {
  const t = useT('calls');
  if (state === 'idle') return null;

  const name        = otherUser?.display_name ?? otherUser?.username ?? '?';
  const isIncoming  = state === 'incoming';
  const connected   = state === 'connected';
  const q           = quality(latency);

  const status = isIncoming
    ? t('incoming')
    : connected
      ? (remotePresent ? fmt(callSeconds) : t('peerLeft'))
      : t('calling', { name });

  return (
    <div className="relative shrink-0 overflow-hidden border-b border-border/20 bg-card/40">
      {/* Quality header */}
      {connected && remotePresent && (
        <div className="flex items-center justify-center gap-1.5 pt-3">
          <Signal className={cn('h-3.5 w-3.5', q.color)} />
          <span className={cn('text-[12px] font-semibold', q.color)}>{t(q.key)}</span>
          {latency != null && (
            <span className="text-[11px] text-muted-foreground/60">· {latency} {t('ms')}</span>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 px-4 pt-2 pb-5">
        {/* Avatars — bigger, no names */}
        <div className="flex items-center justify-center gap-6">
          <CallAvatar
            user={otherUser}
            level={remoteLevel}
            connected={isIncoming ? true : (connected && remotePresent)}
            muted={remoteMuted && connected}
            deafened={remoteDeafened && connected}
            size={104}
          />
          {me && !isIncoming && (
            <CallAvatar
              user={me}
              level={muted ? 0 : localLevel}
              connected
              muted={muted}
              deafened={deafened}
              size={104}
            />
          )}
        </div>

        {/* Status */}
        <p className="text-[13px] text-muted-foreground">{status}</p>

        {/* Controls */}
        <div className="mt-1 flex items-center gap-2.5">
          {isIncoming ? (
            <>
              <CallButton variant="accept" onClick={onAccept} title={t('accept')}>
                <span className="flex items-center gap-2 px-5 text-sm font-semibold">
                  <Phone className="h-[18px] w-[18px]" /> {t('accept')}
                </span>
              </CallButton>
              <CallButton variant="end" onClick={onEnd} title={t('decline')}>
                <span className="flex items-center gap-2 px-5 text-sm font-semibold">
                  <PhoneOff className="h-[18px] w-[18px]" /> {t('decline')}
                </span>
              </CallButton>
            </>
          ) : (
            <>
              <CallButton variant={muted ? 'muted' : 'mute'} onClick={onToggleMute} title={muted ? t('unmute') : t('mute')}>
                <span className="flex w-11 items-center justify-center">
                  {muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
                </span>
              </CallButton>
              <CallButton variant={deafened ? 'muted' : 'mute'} onClick={onToggleDeafen} title={deafened ? t('undeafen') : t('deafen')}>
                <span className="flex w-11 items-center justify-center">
                  {deafened ? <HeadphoneOff className="h-[18px] w-[18px]" /> : <Headphones className="h-[18px] w-[18px]" />}
                </span>
              </CallButton>
              <CallButton variant="end" onClick={onEnd} title={t('end')}>
                <span className="flex w-14 items-center justify-center">
                  <PhoneOff className="h-[18px] w-[18px]" />
                </span>
              </CallButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
