'use client';

import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useT } from '@/providers/i18n-provider';
import { MemberActionsMenu } from './member-actions-menu';

interface ModCaps { is_owner: boolean; can_kick: boolean; can_ban: boolean; can_timeout: boolean }

/**
 * Moderation row shown inside the profile popup when it's opened from a server
 * context (member list, channel chat). Resolves the viewer's moderation
 * capabilities and, if they have any, exposes the same "⋮" actions menu
 * (timeout / kick / ban / transfer) used in server settings.
 */
export function ProfileModActions({ serverId, memberId, username }: { serverId: string; memberId: string; username: string }) {
  const t = useT('servers');
  const sbRef = useRef(createClient());
  const [caps, setCaps] = useState<ModCaps | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sbRef.current as any).rpc('my_server_mod', { p_server: serverId }).then(({ data }: { data: ModCaps[] | null }) => {
      if (active && Array.isArray(data) && data[0]) setCaps(data[0]);
    });
    return () => { active = false; };
  }, [serverId]);

  if (!caps || !(caps.is_owner || caps.can_kick || caps.can_ban || caps.can_timeout)) return null;

  return (
    <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-2xl bg-secondary/60 px-4 py-2.5">
      <span className="text-[13px] font-medium text-muted-foreground">{t('moderation')}</span>
      <MemberActionsMenu
        serverId={serverId}
        member={{ id: memberId, username, is_owner: false }}
        isOwner={caps.is_owner}
        canKick={caps.can_kick}
        canBan={caps.can_ban}
        canTimeout={caps.can_timeout}
      />
    </div>
  );
}
