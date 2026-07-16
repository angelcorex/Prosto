'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ALONE_TIMEOUT_MS = 5 * 60 * 1000; // auto-end after 5 min alone

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

interface UseCallArgs {
  supabase: SB;
  conversationId: string;
  myId: string;
  onCallStarted?: () => void;
  onCallEnded?: (info: { seconds: number; connected: boolean; byMe: boolean }) => void;
}

export function useCall({ supabase, conversationId, myId, onCallStarted, onCallEnded }: UseCallArgs) {
  const [state,         setState]         = useState<CallState>('idle');
  const [muted,         setMuted]         = useState(false);
  const [deafened,      setDeafened]      = useState(false);
  const [remoteMuted,   setRemoteMuted]   = useState(false);
  const [remoteDeafened,setRemoteDeafened]= useState(false);
  const [remotePresent, setRemotePresent] = useState(true);
  const [localLevel,    setLocalLevel]    = useState(0);
  const [remoteLevel,   setRemoteLevel]   = useState(0);
  const [callSeconds,   setCallSeconds]   = useState(0);
  const [latency,       setLatency]       = useState<number | null>(null);

  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef     = useRef<SB>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOffer   = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce     = useRef<RTCIceCandidateInit[]>([]);
  const monitors       = useRef<Array<() => void>>([]);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const aloneTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedByMe    = useRef(false);
  const connectedRef   = useRef(false);
  const connectedAt    = useRef(0);
  const onEndedRef     = useRef(onCallEnded);
  const onStartedRef   = useRef(onCallStarted);
  onEndedRef.current   = onCallEnded;
  onStartedRef.current = onCallStarted;

  function reportEnded() {
    if (onEndedRef.current) {
      const seconds = connectedAt.current ? Math.round((Date.now() - connectedAt.current) / 1000) : 0;
      onEndedRef.current({ seconds, connected: connectedRef.current, byMe: startedByMe.current });
    }
    connectedRef.current = false;
    connectedAt.current  = 0;
    startedByMe.current  = false;
  }

  /* ── Signaling channel ── */
  useEffect(() => {
    const ch = supabase.channel(`call:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'signal' }, ({ payload }: { payload: any }) => handleSignal(payload));
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  /* ── Call duration timer ── */
  useEffect(() => {
    if (state === 'connected') {
      timerRef.current = setInterval(() => setCallSeconds(s => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  /* ── Connection quality: poll RTT from WebRTC stats ── */
  useEffect(() => {
    if (state !== 'connected') { setLatency(null); return; }
    const id = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        stats.forEach((r: any) => {
          if (r.type === 'candidate-pair' && (r.nominated || r.state === 'succeeded') && r.currentRoundTripTime != null) {
            rtt = r.currentRoundTripTime * 1000; // → ms
          }
        });
        if (rtt != null) setLatency(Math.round(rtt));
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [state]);

  function send(type: string, data: Record<string, unknown> = {}) {
    channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { type, from: myId, ...data } });
  }

  function startAloneTimer() {
    if (aloneTimer.current) clearTimeout(aloneTimer.current);
    aloneTimer.current = setTimeout(() => { endCall(); }, ALONE_TIMEOUT_MS);
  }
  function clearAloneTimer() {
    if (aloneTimer.current) { clearTimeout(aloneTimer.current); aloneTimer.current = null; }
  }

  async function handleSignal(p: any) {
    if (!p || p.from === myId) return;
    switch (p.type) {
      case 'offer':
        pendingOffer.current = p.sdp;
        setRemotePresent(true);
        setState('incoming');
        break;
      case 'answer':
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(p.sdp);
          await flushIce();
          connectedRef.current = true;
          connectedAt.current = Date.now();
          setRemotePresent(true);
          setState('connected');
        }
        break;
      case 'ice':
        if (p.candidate) {
          if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(p.candidate).catch(() => {});
          else pendingIce.current.push(p.candidate);
        }
        break;
      case 'mute':
        setRemoteMuted(!!p.muted);
        break;
      case 'deafen':
        setRemoteDeafened(!!p.deafened);
        break;
      case 'leave':
        if (!connectedRef.current) {
          // declined before connecting
          reportEnded();
          cleanup();
          setState('idle');
        } else {
          // peer left an active call — stay alone, auto-end after timeout
          setRemotePresent(false);
          setRemoteLevel(0);
          startAloneTimer();
        }
        break;
    }
  }

  async function flushIce() {
    for (const c of pendingIce.current) await pcRef.current?.addIceCandidate(c).catch(() => {});
    pendingIce.current = [];
  }

  function createPc() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => { if (e.candidate) send('ice', { candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
      monitorLevel(stream, setRemoteLevel);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        connectedRef.current = true;
        if (!connectedAt.current) connectedAt.current = Date.now();
        setRemotePresent(true);
        clearAloneTimer();
        setState('connected');
      }
    };
    pcRef.current = pc;
    return pc;
  }

  async function getMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    monitorLevel(stream, setLocalLevel);
    return stream;
  }

  const startCall = useCallback(async () => {
    try {
      startedByMe.current = true;
      setRemotePresent(false); // peer hasn't joined yet
      setCallSeconds(0);
      const pc = createPc();
      const stream = await getMic();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send('offer', { sdp: offer });
      setState('calling');
      onStartedRef.current?.(); // log "started a call" immediately
    } catch {
      cleanup();
      setState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptCall = useCallback(async () => {
    if (!pendingOffer.current) return;
    try {
      startedByMe.current = false;
      setCallSeconds(0);
      const pc = createPc();
      const stream = await getMic();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      await pc.setRemoteDescription(pendingOffer.current);
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send('answer', { sdp: answer });
      connectedRef.current = true;
      connectedAt.current = Date.now();
      setRemotePresent(true);
      setState('connected');
    } catch {
      cleanup();
      setState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endCall = useCallback(() => {
    send('leave', {});
    reportEnded();
    cleanup();
    setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      const nowMuted = !track.enabled;
      setMuted(nowMuted);
      send('mute', { muted: nowMuted });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened(prev => {
      const next = !prev;
      // Mute / unmute the incoming audio
      if (remoteAudioRef.current) remoteAudioRef.current.muted = next;
      // Deafening also mutes your own mic (Discord behaviour)
      const track = localStreamRef.current?.getAudioTracks()[0];
      if (track) {
        track.enabled = !next;
        setMuted(next);
        send('mute', { muted: next });
      }
      send('deafen', { deafened: next });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    clearAloneTimer();
    monitors.current.forEach(stop => stop());
    monitors.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    setMuted(false);
    setDeafened(false);
    setRemoteMuted(false);
    setRemoteDeafened(false);
    setRemotePresent(true);
    setLocalLevel(0);
    setRemoteLevel(0);
    setCallSeconds(0);
  }

  /* ── Mic level detection (0..1, smoothed) ── */
  function monitorLevel(stream: MediaStream, setter: (v: number) => void) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      let active = true;
      let smooth = 0;
      const tick = () => {
        if (!active) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(1, Math.max(0, (avg - 8) / 60));
        smooth = smooth * 0.6 + level * 0.4;
        setter(smooth);
        raf = requestAnimationFrame(tick);
      };
      tick();
      monitors.current.push(() => { active = false; cancelAnimationFrame(raf); ctx.close().catch(() => {}); });
    } catch { /* no web audio */ }
  }

  return {
    state, muted, deafened, remoteMuted, remoteDeafened, remotePresent, localLevel, remoteLevel, callSeconds, latency,
    startCall, acceptCall, endCall, toggleMute, toggleDeafen,
    remoteAudioRef,
  };
}
