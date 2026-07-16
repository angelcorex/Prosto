'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { ProfilePopup, type ProfilePopupUser } from '@/components/shell/profile-popup';
import type { GroupMember } from '../types';
import { GroupMembersPanel } from './group-members-panel';

interface GroupRightPanelProps {
  /** Always-present search slot (top). */
  search: ReactNode;
  /** Always-present footer slot (language toggle, links…). */
  footer: ReactNode;
}

/**
 * Right-panel slot. Search and footer stay visible everywhere; when the active
 * route is a group conversation the members list is shown additionally between
 * them.
 */
export function GroupRightPanel({ search, footer }: GroupRightPanelProps) {
  const pathname = usePathname();
  const sbRef = useRef(createClient());
  const [convId, setConvId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  // For a 1:1 DM (route is a user's public_id, not a group) we show that user's
  // profile card under the search — Discord-style.
  const [dmUser, setDmUser] = useState<ProfilePopupUser | null>(null);

  const match = pathname.match(/^\/messages\/([^/]+)/);
  const routeId = match ? match[1] : null;

  useEffect(() => {
    let active = true;
    const sb = sbRef.current;

    async function load() {
      if (!routeId) { if (active) { setConvId(null); setMembers([]); setDmUser(null); } return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: g } = await (sb as any).rpc('get_group', { gpid: routeId });
      const grp = Array.isArray(g) ? g[0] : g;
      if (!active) return;
      if (!grp?.conversation_id) {
        // Not a group → the route id is the other user's public_id. Load their
        // profile for the right-panel card.
        setConvId(null);
        setMembers([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: u } = await (sb as any)
          .from('profiles')
          .select('id, username, display_name, avatar_url, banner_url, pronouns, bio, is_verified, is_moderator, is_premium, status, last_seen, custom_status, created_at, public_id:public_id::text')
          .eq('public_id', routeId)
          .maybeSingle();
        if (active) setDmUser(u ?? null);
        return;
      }
      setDmUser(null);
      setConvId(grp.conversation_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (sb as any).rpc('get_conversation_members', { conv: grp.conversation_id });
      if (active) setMembers(m ?? []);
    }

    load();
    return () => { active = false; };
  }, [routeId]);

  useEffect(() => {
    if (!convId) return;
    const sb = sbRef.current;
    async function refresh() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: m } = await (sb as any).rpc('get_conversation_members', { conv: convId });
      setMembers(m ?? []);
    }
    const ch = sb
      .channel(`group-members:${convId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversation_participants',
        filter: `conversation_id=eq.${convId}`,
      }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [convId]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-5">{search}</div>

      {convId ? (
        <div className="min-h-0 flex-1 overflow-hidden border-t border-border/20 pt-2">
          <GroupMembersPanel conversationId={convId} members={members} />
        </div>
      ) : dmUser ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/20 px-3 pt-4">
          {/* Discord-style: the DM partner's profile card, inline (not a popup).
              ProfilePopup fetches the rest (stats, connections) + has the composer. */}
          <ProfilePopup key={dmUser.username} user={dmUser} hideComposer />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="shrink-0">{footer}</div>
    </div>
  );
}
