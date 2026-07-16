import type { ProviderId } from './providers';

/** Safe connection info surfaced to the client (no tokens). */
export interface Connection {
  provider:         ProviderId;
  provider_username: string | null;
  provider_url:      string | null;
  show_on_profile:   boolean;
}

/** Public connection shown on a profile (no visibility flag). */
export interface PublicConnection {
  provider:          ProviderId;
  provider_username: string | null;
  provider_url:      string | null;
}

/** Live "now playing" snapshot from a music provider (Spotify / Ataraxis). */
export interface NowPlaying {
  playing:    boolean;
  title:      string;
  artists:    string;
  albumArt:   string | null;
  trackUrl:   string | null;
  progressMs: number;
  durationMs: number;
  /**
   * Epoch ms when playback of the current track started, when the provider
   * gives it (Ataraxis `playedAt`). The card uses this to compute live progress
   * (`now - startedAt`) since Ataraxis returns no `progressMs`. Null when the
   * provider reports progress directly (Spotify).
   */
  startedAt?: number | null;
}
