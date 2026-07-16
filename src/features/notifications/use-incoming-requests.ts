'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Live count of incoming pending friend requests awaiting the user's action. */
export function useIncomingFriendRequests() {
  const [count, setCount] = useState(0);
  const sbRef = useRef(createClient());

  useEffect(() => {
    const sb = sbRef.current;

    async function load() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: c } = await (sb as any)
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('to_id', user.id)
        .eq('status', 'pending');
      setCount(c ?? 0);
    }

    load();

    const ch = sb
      .channel('friend-req-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => load())
      .subscribe();

    const onChange = () => load();
    window.addEventListener('friends:changed', onChange);
    const poll = setInterval(load, 45000);

    return () => {
      sb.removeChannel(ch);
      window.removeEventListener('friends:changed', onChange);
      clearInterval(poll);
    };
  }, []);

  return count;
}
