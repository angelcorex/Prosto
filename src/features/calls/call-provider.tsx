'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { createClient } from '@/lib/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ALONE_TIMEOUT_MS = 5 * 60 * 1000;
const SIGNAL_JOIN_TIMEOUT_MS = 8_000;

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

export interface CallUser {
  id: string;
  public_id?: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  is_moderator?: boolean;
  is_premium?: boolean;
}

interface StartCallArgs {
  conversationId: string;
  peer: CallUser;
}

interface CallInviteRow {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  offer: RTCSessionDescriptionInit;
  status: 'ringing' | 'ended';
  expires_at: string;
}

interface CallSignal {
  type?: 'ready' | 'answer' | 'ice' | 'mute' | 'deafen' | 'leave';
  from?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  muted?: boolean;
  deafened?: boolean;
}

export interface CallContextValue {
  state: CallState;
  callId: string | null;
  conversationId: string | null;
  peer: CallUser | null;
  me: CallUser;
  muted: boolean;
  deafened: boolean;
  remoteMuted: boolean;
  remoteDeafened: boolean;
  remotePresent: boolean;
  localLevel: number;
  remoteLevel: number;
  callSeconds: number;
  latency: number | null;
  startCall: (args: StartCallArgs) => Promise<void>;
  acceptCall: () => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  remoteAudioRef: RefObject<HTMLAudioElement | null>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error('useCall must be used within CallProvider');
  return value;
}

export function CallProvider({ me, children }: { me: CallUser; children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<CallState>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [peer, setPeer] = useState<CallUser | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteDeafened, setRemoteDeafened] = useState(false);
  const [remotePresent, setRemotePresent] = useState(true);
  const [localLevel, setLocalLevel] = useState(0);
  const [remoteLevel, setRemoteLevel] = useState(0);
  const [callSeconds, setCallSeconds] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  const stateRef = useRef<CallState>('idle');
  const callIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const processingInviteRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<SB>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localIceRef = useRef<RTCIceCandidateInit[]>([]);
  const peerReadyRef = useRef(false);
  const monitorsRef = useRef<Array<() => void>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aloneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedByMeRef = useRef(false);
  const connectedRef = useRef(false);
  const connectedAtRef = useRef(0);
  const mountedRef = useRef(true);

  function updateState(next: CallState) {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }

  function isCurrent(id: string): boolean {
    return callIdRef.current === id;
  }

  function beginSession(id: string, convId: string, nextPeer: CallUser) {
    callIdRef.current = id;
    conversationIdRef.current = convId;
    peerIdRef.current = nextPeer.id;
    if (mountedRef.current) {
      setCallId(id);
      setConversationId(convId);
      setPeer(nextPeer);
    }
  }

  function clearSession() {
    callIdRef.current = null;
    conversationIdRef.current = null;
    peerIdRef.current = null;
    processingInviteRef.current = null;
    if (mountedRef.current) {
      setCallId(null);
      setConversationId(null);
      setPeer(null);
    }
  }

  async function logCallMessage(convId: string, kind: 'started' | 'ended', seconds: number | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('log_call_message', { conv_id: convId, kind, seconds });
  }

  function reportEnded() {
    const convId = conversationIdRef.current;
    if (startedByMeRef.current && convId) {
      const seconds = connectedAtRef.current
        ? Math.round((Date.now() - connectedAtRef.current) / 1000)
        : 0;
      void logCallMessage(convId, 'ended', connectedRef.current ? seconds : -1);
    }
    connectedRef.current = false;
    connectedAtRef.current = 0;
    startedByMeRef.current = false;
  }

  function clearAloneTimer() {
    if (!aloneTimerRef.current) return;
    clearTimeout(aloneTimerRef.current);
    aloneTimerRef.current = null;
  }

  function clearInviteExpiry() {
    if (!inviteExpiryRef.current) return;
    clearTimeout(inviteExpiryRef.current);
    inviteExpiryRef.current = null;
  }

  function scheduleInviteExpiry(expiresAt: string) {
    clearInviteExpiry();
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    inviteExpiryRef.current = setTimeout(() => {
      const id = callIdRef.current;
      if (!id || connectedRef.current) return;
      void endInvite(id);
      reportEnded();
      cleanupCall();
      clearSession();
      updateState('idle');
    }, delay);
  }

  function startAloneTimer() {
    clearAloneTimer();
    aloneTimerRef.current = setTimeout(() => endCall(), ALONE_TIMEOUT_MS);
  }

  function markConnected() {
    connectedRef.current = true;
    if (!connectedAtRef.current) connectedAtRef.current = Date.now();
    clearInviteExpiry();
    clearAloneTimer();
    if (mountedRef.current) setRemotePresent(true);
    updateState('connected');
  }

  function handlePeerLeft() {
    if (!connectedRef.current) {
      reportEnded();
      cleanupCall();
      clearSession();
      updateState('idle');
      return;
    }
    if (mountedRef.current) {
      setRemotePresent(false);
      setRemoteLevel(0);
    }
    startAloneTimer();
  }

  async function endInvite(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('end_call_invite', { invite_id: id });
  }

  async function openSignalChannel(id: string): Promise<void> {
    if (signalChannelRef.current) {
      await supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('call signaling subscription timed out'));
      }, SIGNAL_JOIN_TIMEOUT_MS);

      const channel = supabase
        .channel(`call:${id}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'signal' }, ({ payload }: { payload: CallSignal }) => {
          void handleSignal(payload);
        })
        .subscribe((status: string) => {
          if (settled) return;
          if (status === 'SUBSCRIBED') {
            settled = true;
            clearTimeout(timeout);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`call signaling subscription failed: ${status}`));
          }
        });

      signalChannelRef.current = channel;
    });
  }

  async function sendSignal(type: NonNullable<CallSignal['type']>, data: Omit<CallSignal, 'type' | 'from'> = {}) {
    const channel = signalChannelRef.current;
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { type, from: me.id, ...data },
    });
  }

  async function flushRemoteIce() {
    for (const candidate of pendingIceRef.current) {
      await pcRef.current?.addIceCandidate(candidate).catch(() => {});
    }
    pendingIceRef.current = [];
  }

  async function flushLocalIce() {
    if (!peerReadyRef.current) return;
    const candidates = localIceRef.current;
    localIceRef.current = [];
    for (const candidate of candidates) {
      await sendSignal('ice', { candidate });
    }
  }

  async function handleSignal(payload: CallSignal) {
    if (!payload?.type || !payload.from || payload.from === me.id) return;
    if (payload.from !== peerIdRef.current) return;

    switch (payload.type) {
      case 'ready':
        peerReadyRef.current = true;
        await flushLocalIce();
        break;
      case 'answer':
        if (payload.sdp && pcRef.current && !pcRef.current.remoteDescription) {
          await pcRef.current.setRemoteDescription(payload.sdp);
          await flushRemoteIce();
          markConnected();
        }
        break;
      case 'ice':
        if (!payload.candidate) break;
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(payload.candidate).catch(() => {});
        } else {
          pendingIceRef.current.push(payload.candidate);
        }
        break;
      case 'mute':
        if (mountedRef.current) setRemoteMuted(!!payload.muted);
        break;
      case 'deafen':
        if (mountedRef.current) setRemoteDeafened(!!payload.deafened);
        break;
      case 'leave':
        handlePeerLeft();
        break;
    }
  }

  async function createPc(expectedCallId: string) {
    // Keep the TURN credential flow aligned with the existing implementation.
    let iceServers = ICE_SERVERS;
    const controller = new AbortController();
    const credentialTimeoutMs = 5_000;
    const timeout = setTimeout(() => controller.abort(), credentialTimeoutMs);

    try {
      const response = await fetch('/api/calls/turn-credentials', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TURN credentials request failed with status ${response.status}`);

      const credentials = await response.json() as {
        urls?: unknown;
        username?: unknown;
        credential?: unknown;
      };
      if (
        !Array.isArray(credentials.urls)
        || credentials.urls.length === 0
        || !credentials.urls.every(url => typeof url === 'string' && url.startsWith('turn:'))
        || typeof credentials.username !== 'string'
        || typeof credentials.credential !== 'string'
      ) {
        throw new Error('TURN credentials response is invalid');
      }

      iceServers = [
        ...ICE_SERVERS,
        {
          urls: credentials.urls,
          username: credentials.username,
          credential: credentials.credential,
        },
      ];
    } catch (error) {
      // Direct/STUN connectivity can still succeed when TURN is unavailable.
      console.warn('[calls] TURN credentials unavailable; using STUN only', error);
    } finally {
      clearTimeout(timeout);
    }

    if (!isCurrent(expectedCallId)) throw new Error('call cancelled');

    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (event) => {
      if (!event.candidate || !isCurrent(expectedCallId)) return;
      const candidate = event.candidate.toJSON();
      if (startedByMeRef.current && !peerReadyRef.current) {
        localIceRef.current.push(candidate);
      } else {
        void sendSignal('ice', { candidate });
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
      monitorLevel(stream, setRemoteLevel);
    };
    pc.onconnectionstatechange = () => {
      if (!isCurrent(expectedCallId)) return;
      if (pc.connectionState === 'connected') markConnected();
      if (pc.connectionState === 'failed') handlePeerLeft();
    };
    pcRef.current = pc;
    return pc;
  }

  async function getMic(expectedCallId: string) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (!isCurrent(expectedCallId)) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('call cancelled');
    }
    localStreamRef.current = stream;
    monitorLevel(stream, setLocalLevel);
    return stream;
  }

  async function startCall({ conversationId: convId, peer: nextPeer }: StartCallArgs) {
    if (stateRef.current !== 'idle' || processingInviteRef.current) return;

    const id = crypto.randomUUID();
    beginSession(id, convId, nextPeer);
    startedByMeRef.current = true;
    connectedRef.current = false;
    connectedAtRef.current = 0;
    peerReadyRef.current = false;
    if (mountedRef.current) {
      setRemotePresent(false);
      setCallSeconds(0);
    }
    updateState('calling');

    try {
      await openSignalChannel(id);
      if (!isCurrent(id)) return;
      const pc = await createPc(id);
      const stream = await getMic(id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!isCurrent(id)) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('create_call_invite', {
        invite_id: id,
        conv_id: convId,
        invite_offer: offer,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.callee_id !== nextPeer.id) throw new Error('call recipient mismatch');
      scheduleInviteExpiry(row.expires_at as string);
      void logCallMessage(convId, 'started', null);
    } catch {
      if (!isCurrent(id)) return;
      void endInvite(id);
      cleanupCall();
      clearSession();
      updateState('idle');
    }
  }

  async function acceptCall() {
    const id = callIdRef.current;
    const offer = pendingOfferRef.current;
    if (!id || stateRef.current !== 'incoming' || !offer) return;

    try {
      startedByMeRef.current = false;
      if (mountedRef.current) setCallSeconds(0);
      const pc = await createPc(id);
      const stream = await getMic(id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(offer);
      await flushRemoteIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (!isCurrent(id)) return;
      await sendSignal('answer', { sdp: answer });
      markConnected();
    } catch {
      if (!isCurrent(id)) return;
      void sendSignal('leave');
      void endInvite(id);
      cleanupCall();
      clearSession();
      updateState('idle');
    }
  }

  function endCall() {
    const id = callIdRef.current;
    if (!id || stateRef.current === 'idle') return;
    void sendSignal('leave');
    void endInvite(id);
    reportEnded();
    cleanupCall();
    clearSession();
    updateState('idle');
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const next = !track.enabled;
    if (mountedRef.current) setMuted(next);
    void sendSignal('mute', { muted: next });
  }

  function toggleDeafen() {
    setDeafened((previous) => {
      const next = !previous;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
      const track = localStreamRef.current?.getAudioTracks()[0];
      if (track) {
        track.enabled = !next;
        setMuted(next);
        void sendSignal('mute', { muted: next });
      }
      void sendSignal('deafen', { deafened: next });
      return next;
    });
  }

  async function processIncomingInvite(row: CallInviteRow) {
    if (!row?.id || row.status !== 'ringing' || row.callee_id !== me.id) return;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      void endInvite(row.id);
      return;
    }
    if (stateRef.current !== 'idle' || processingInviteRef.current) {
      void endInvite(row.id);
      return;
    }

    processingInviteRef.current = row.id;
    try {
      // The invite row itself is produced by a guarded SECURITY DEFINER RPC;
      // profile lookup supplies display metadata only, never caller authority.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, public_id, username, display_name, avatar_url, is_verified, is_moderator, is_premium')
        .eq('id', row.caller_id)
        .maybeSingle();
      if (!data || processingInviteRef.current !== row.id || stateRef.current !== 'idle') {
        void endInvite(row.id);
        return;
      }

      const caller: CallUser = {
        id: data.id,
        public_id: data.public_id,
        username: data.username,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        is_verified: data.is_verified,
        is_moderator: data.is_moderator,
        is_premium: data.is_premium,
      };
      beginSession(row.id, row.conversation_id, caller);
      pendingOfferRef.current = row.offer;
      startedByMeRef.current = false;
      connectedRef.current = false;
      connectedAtRef.current = 0;
      peerReadyRef.current = true;
      if (mountedRef.current) {
        setRemotePresent(true);
        setCallSeconds(0);
      }
      await openSignalChannel(row.id);
      if (!isCurrent(row.id)) return;
      updateState('incoming');
      scheduleInviteExpiry(row.expires_at);
      await sendSignal('ready');
    } catch {
      if (callIdRef.current === row.id) {
        cleanupCall();
        clearSession();
        updateState('idle');
      }
      void endInvite(row.id);
      processingInviteRef.current = null;
    }
  }

  function handleInviteEnded(row: CallInviteRow) {
    if (row.status !== 'ended') return;
    if (processingInviteRef.current === row.id) processingInviteRef.current = null;
    if (!isCurrent(row.id)) return;
    handlePeerLeft();
  }

  function cleanupCall(resetUi = true) {
    clearAloneTimer();
    clearInviteExpiry();
    monitorsRef.current.forEach((stop) => stop());
    monitorsRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    localIceRef.current = [];
    peerReadyRef.current = false;
    if (signalChannelRef.current) {
      void supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }
    if (!resetUi || !mountedRef.current) return;
    setMuted(false);
    setDeafened(false);
    setRemoteMuted(false);
    setRemoteDeafened(false);
    setRemotePresent(true);
    setLocalLevel(0);
    setRemoteLevel(0);
    setCallSeconds(0);
    setLatency(null);
  }

  function monitorLevel(stream: MediaStream, setter: (value: number) => void) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      let active = true;
      let smooth = 0;
      const tick = () => {
        if (!active) return;
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        const level = Math.min(1, Math.max(0, (average - 8) / 60));
        smooth = smooth * 0.6 + level * 0.4;
        setter(smooth);
        frame = requestAnimationFrame(tick);
      };
      tick();
      monitorsRef.current.push(() => {
        active = false;
        cancelAnimationFrame(frame);
        void context.close();
      });
    } catch {
      // Web Audio is optional; the call itself still works without level meters.
    }
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state === 'connected') {
      timerRef.current = setInterval(() => setCallSeconds((seconds) => seconds + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  useEffect(() => {
    if (state !== 'connected') {
      setLatency(null);
      return;
    }
    const interval = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let roundTripTime: number | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stats.forEach((report: any) => {
          if (
            report.type === 'candidate-pair'
            && (report.nominated || report.state === 'succeeded')
            && report.currentRoundTripTime != null
          ) {
            roundTripTime = report.currentRoundTripTime * 1000;
          }
        });
        if (roundTripTime != null) setLatency(Math.round(roundTripTime));
      } catch {
        // Connection stats are best-effort only.
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    const inviteChannel = supabase
      .channel(`call-invites:${me.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_invites', filter: `callee_id=eq.${me.id}` },
        (payload: { new: CallInviteRow }) => { void processIncomingInvite(payload.new); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `callee_id=eq.${me.id}` },
        (payload: { new: CallInviteRow }) => handleInviteEnded(payload.new),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `caller_id=eq.${me.id}` },
        (payload: { new: CallInviteRow }) => handleInviteEnded(payload.new),
      )
      .subscribe();

    void (supabase as SB)
      .from('call_invites')
      .select('id, conversation_id, caller_id, callee_id, offer, status, expires_at')
      .eq('callee_id', me.id)
      .eq('status', 'ringing')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: CallInviteRow | null }) => {
        if (active && data) void processIncomingInvite(data);
      });

    return () => {
      active = false;
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      void supabase.removeChannel(inviteChannel);
      cleanupCall(false);
    };
    // The authenticated layout owns this provider for the lifetime of one user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, supabase]);

  const value: CallContextValue = {
    state,
    callId,
    conversationId,
    peer,
    me,
    muted,
    deafened,
    remoteMuted,
    remoteDeafened,
    remotePresent,
    localLevel,
    remoteLevel,
    callSeconds,
    latency,
    startCall,
    acceptCall,
    endCall,
    toggleMute,
    toggleDeafen,
    remoteAudioRef,
  };

  return (
    <CallContext.Provider value={value}>
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      {children}
    </CallContext.Provider>
  );
}
