'use client';

import { useEffect, useRef, useState } from 'react';

interface UseTypingIndicatorOptions {
  channelId: string;
  myId: string;
  myName: string;
  // Shared channel ref created by useChannelMessages — typing broadcasts ride
  // on the same Supabase Realtime channel as message postgres_changes so we
  // don't open a second socket for the same topic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chanRef: React.MutableRefObject<any>;
}

interface UseTypingIndicatorResult {
  /** Map of userId → displayName for users currently typing. */
  typers: Record<string, string>;
  broadcastTyping: () => void;
}

export function useTypingIndicator({
  channelId,
  myId,
  myName,
  chanRef,
}: UseTypingIndicatorOptions): UseTypingIndicatorResult {
  const [typers, setTypers] = useState<Record<string, string>>({});
  const typerTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingRef = useRef(0);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wire up the typing-broadcast listener on the shared channel.
  // The channel itself is owned by useChannelMessages; we just attach an
  // additional event handler once it's ready. We poll until chanRef is set
  // because the channel subscribe is async.
  useEffect(() => {
    let cancelled = false;

    function attach() {
      const ch = chanRef.current;
      if (!ch) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ch.on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        const from = payload?.from as string | undefined;
        if (!from || from === myId) return;
        const name = (payload?.name as string) || '…';
        setTypers((prev) => ({ ...prev, [from]: name }));
        if (typerTimers.current[from]) clearTimeout(typerTimers.current[from]);
        typerTimers.current[from] = setTimeout(() => {
          setTypers((prev) => {
            const n = { ...prev };
            delete n[from];
            return n;
          });
        }, 4500);
      });
      return true;
    }

    // If chanRef isn't populated yet (first render), retry until it is.
    if (!attach()) {
      const interval = setInterval(() => {
        if (cancelled) { clearInterval(interval); return; }
        if (attach()) clearInterval(interval);
      }, 50);
    }

    return () => {
      cancelled = true;
      Object.values(typerTimers.current).forEach(clearTimeout);
      typerTimers.current = {};
    };
    // chanRef is a stable ref — intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, myId]);

  function broadcastTyping() {
    const ch = chanRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      ch.send({ type: 'broadcast', event: 'typing', payload: { from: myId, name: myName } });
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => { lastTypingRef.current = 0; }, 2500);
  }

  return { typers, broadcastTyping };
}
