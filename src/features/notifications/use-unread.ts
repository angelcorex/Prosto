'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Live count of the current user's unread notifications. */
export function useUnreadNotifications() {
  const [count, setCount] = useState(0);
  const sbRef = useRef(createClient());
  const chanId = useRef(`notif-badge-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const sb = sbRef.current;

    async function load() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: c } = await (sb as any)
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .neq('type', 'message');
      setCount(c ?? 0);
    }

    load();

    const ch = sb
      .channel(chanId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => load())
      .subscribe();

    const onRead = () => setCount(0);
    window.addEventListener('notifications:read', onRead);
    const poll = setInterval(load, 60000);

    return () => {
      sb.removeChannel(ch);
      window.removeEventListener('notifications:read', onRead);
      clearInterval(poll);
    };
  }, []);

  return count;
}
