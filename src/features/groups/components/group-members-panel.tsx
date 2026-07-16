'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { AvatarImage } from '@/components/ui/avatar-image';
import { Crown, UserPlus, UserMinus } from 'lucide-react';

import { MiniProfilePopup, VerifiedBadge, ModeratorBadge, PremiumBadge, BotBadge, renderEmojiNodes } from '@/components/ui';
import { AvatarWithStatus, usePresence, DeviceBadge } from '@/features/presence';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import type { GroupMember } from '../types';
import { CreateGroupModal } from './create-group-modal';

interface GroupMembersPanelProps {
  conversationId: string;
  members: GroupMember[];
}

/** Members list for a group, rendered inside the layout's right panel slot. */
export function GroupMembersPanel({ conversationId, members }: GroupMembersPanelProps) {
  const t = useT('messages');
  const [addOpen, setAddOpen] = useState(false);
  const [typers, setTypers] = useState<string[]>([]);
  const [typerIds, setTyperIds] = useState<Set<string>>(new Set());
  const [myId, setMyId] = useState<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mapRef = useRef<Map<string, string>>(new Map());
  const sbRef = useRef(createClient());

  const amOwner = members.some(m => m.is_owner && m.id === myId);

  useEffect(() => {
    sbRef.current.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  async function kick(target: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sbRef.current as any).rpc('remove_group_member', { conv: conversationId, target });
    window.dispatchEvent(new CustomEvent('prosto:conv-updated', { detail: { conversationId } }));
  }

  /* Show who is typing in this group (driven by the DM list's broadcasts). */
  useEffect(() => {
    function publish() {
      setTypers(Array.from(mapRef.current.values()));
      setTyperIds(new Set(mapRef.current.keys()));
    }
    function onTyping(e: Event) {
      const d = (e as CustomEvent).detail as { conversationId?: string; from?: string; name?: string; typing?: boolean } | undefined;
      if (!d || d.conversationId !== conversationId || !d.from) return;
      const key = d.from;
      const ex = timersRef.current.get(key);
      if (ex) clearTimeout(ex);
      if (d.typing) {
        mapRef.current.set(key, d.name || t('someone'));
        publish();
        timersRef.current.set(key, setTimeout(() => { mapRef.current.delete(key); timersRef.current.delete(key); publish(); }, 5000));
      } else {
        mapRef.current.delete(key);
        timersRef.current.delete(key);
        publish();
      }
    }
    window.addEventListener('prosto:typing', onTyping as EventListener);
    const timers = timersRef.current;
    const idMap = mapRef.current;
    return () => {
      window.removeEventListener('prosto:typing', onTyping as EventListener);
      timers.forEach(clearTimeout);
      timers.clear();
      idMap.clear();
    };
  }, [conversationId, t]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          {t('membersCountLabel')} — {members.length}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {members.map(m => {
          const canKick = amOwner && !m.is_owner && m.id !== myId;
          return (
            <MemberRow
              key={m.id}
              member={m}
              isTyping={typerIds.has(m.id)}
              canKick={canKick}
              kickLabel={t('kickMember')}
              onKick={() => kick(m.id)}
            />
          );
        })}
      </div>

      <div className="p-3">
        {typers.length > 0 && (
          <div className="mb-2 flex items-center gap-2 px-1 text-[12px] text-link">
            <span className="flex items-center gap-0.5">
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
            </span>
            <span className="truncate font-medium">
              {typers.length > 1 ? t('severalTyping') : <>{renderEmojiNodes(typers[0] ?? '')} {t('typing')}</>}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary/80"
        >
          <UserPlus className="h-4 w-4" />
          {t('inviteToGroup')}
        </button>
      </div>

      {addOpen && <CreateGroupModal addToGroup={conversationId} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

/** A single member row with live presence (status updates in real time). */
function MemberRow({
  member, isTyping, canKick, kickLabel, onKick,
}: {
  member: GroupMember;
  isTyping: boolean;
  canKick: boolean;
  kickLabel: string;
  onKick: () => void;
}) {
  const live = usePresence(member.id, member.status, member.last_seen);
  const name = member.display_name ?? member.username;
  const initial = name[0]?.toUpperCase() ?? '?';

  return (
    <div className="group/member relative">
      <MiniProfilePopup className="block w-full" user={{ username: member.username, display_name: member.display_name, avatar_url: member.avatar_url, is_verified: member.is_verified }}>
        <div className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-accent/50">
          <AvatarWithStatus status={live.status} lastSeen={live.last_seen} size={32} dotSize={8}>
            {member.avatar_url
              ? <AvatarImage src={member.avatar_url} alt={name} sizes="32px" className="object-cover" />
              : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-link">{initial}</span>}
          </AvatarWithStatus>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className={member.is_premium ? 'truncate text-[14px] font-medium aurora-text aurora-text-glow' : 'truncate text-[14px] font-medium'}>{renderEmojiNodes(name)}</span>
            {member.is_bot && <BotBadge size="sm" />}
            {member.is_verified && <VerifiedBadge size="sm" />}
            {member.is_moderator && <ModeratorBadge size="sm" />}
            {member.is_premium && <PremiumBadge size="sm" />}
            {!member.is_bot && <DeviceBadge userId={member.id} collapse />}
            {member.is_owner && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" />}
          </div>
          {isTyping && (
            <span className="flex shrink-0 items-center gap-0.5">
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-link" />
            </span>
          )}
        </div>
      </MiniProfilePopup>
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          title={kickLabel}
          className="absolute right-2 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive group-hover/member:flex"
        >
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
