'use client';

import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HeadphoneOff, Headphones, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

import { AvatarImage } from '@/components/ui/avatar-image';
import { VerifiedBadge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useT } from '@/providers/i18n-provider';
import { useCall } from './call-provider';

function peerName(peer: ReturnType<typeof useCall>['peer']): string {
  return peer?.display_name ?? peer?.username ?? '?';
}

function ControlButton({
  active = false,
  danger = false,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
        danger
          ? 'bg-destructive text-white hover:bg-destructive/85'
          : active
            ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
            : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function VoiceConnectionPanel() {
  const call = useCall();
  const t = useT('calls');
  if (call.state !== 'calling' && call.state !== 'connected') return null;

  const name = peerName(call.peer);
  const href = call.peer?.public_id ? `/messages/${call.peer.public_id}` : '/messages';

  return (
    <div className="mb-2 overflow-hidden rounded-[14px] border border-border/40 bg-muted/35 shadow-sm">
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <Link href={href} className="min-w-0 flex-1 rounded-md outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-link/60">
          <p className={cn(
            'truncate text-[12px] font-semibold',
            call.state === 'connected' ? 'text-success' : 'text-link',
          )}>
            {call.state === 'connected' ? t('voiceConnected') : t('connecting')}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">{name}</p>
        </Link>
        <ControlButton
          active={call.muted}
          title={call.muted ? t('unmute') : t('mute')}
          onClick={call.toggleMute}
        >
          {call.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </ControlButton>
        <ControlButton
          active={call.deafened}
          title={call.deafened ? t('undeafen') : t('deafen')}
          onClick={call.toggleDeafen}
        >
          {call.deafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
        </ControlButton>
        <ControlButton danger title={t('end')} onClick={call.endCall}>
          <PhoneOff className="h-4 w-4" />
        </ControlButton>
      </div>
    </div>
  );
}

export function GlobalIncomingCall() {
  const call = useCall();
  const t = useT('calls');
  if (call.state !== 'incoming' || typeof document === 'undefined') return null;

  const name = peerName(call.peer);
  const initial = name[0]?.toUpperCase() ?? '?';

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm animate-fade-in">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="global-incoming-call-title"
        className="surface-solid w-full max-w-sm rounded-3xl border border-border/60 p-6 text-center shadow-2xl animate-pop-in"
      >
        <div className="mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full bg-link/20 ring-4 ring-link/15">
          {call.peer?.avatar_url ? (
            <AvatarImage src={call.peer.avatar_url} alt={name} sizes="96px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-link">{initial}</span>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <h2 id="global-incoming-call-title" className="truncate text-xl font-bold text-foreground">{name}</h2>
          {call.peer?.is_verified && <VerifiedBadge size="sm" />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('incoming')}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void call.acceptCall()}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white transition-colors hover:bg-success/85"
          >
            <Phone className="h-5 w-5" />
            {t('accept')}
          </button>
          <button
            type="button"
            onClick={call.endCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-white transition-colors hover:bg-destructive/85"
          >
            <PhoneOff className="h-5 w-5" />
            {t('decline')}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
