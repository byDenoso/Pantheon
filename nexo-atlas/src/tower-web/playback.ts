// Display-time playback of canonical creation timestamps. Never writes to records or graph data.
export const PLAYBACK_RATES = [0.25, 0.5, 1] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];
export const REPLAY_DURATION_MS = 16_000;
export interface PlaybackState {cut: number | null; playing: boolean; rate: PlaybackRate}

/** A monotonic, seekable clock. A hidden/suspended tab establishes a new baseline on return. */
export function createPlaybackClock(min: number, max: number, duration = REPLAY_DURATION_MS) {
  const available = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const durationMs = Number.isFinite(duration) && duration > 0 ? duration : REPLAY_DURATION_MS;
  const state: PlaybackState = {cut: null, playing: false, rate: 0.5};
  let last: number | null = null;
  const resetFrame = () => { last = null; };
  const snapshot = (): PlaybackState => ({...state});
  const pause = () => { state.playing = false; resetFrame(); };
  const seek = (cut: number | null) => {
    pause();
    state.cut = cut === null || !available || !Number.isFinite(cut) ? null : Math.max(min, Math.min(max, cut));
  };
  const play = () => {
    if (!available) return;
    if (state.cut === null || state.cut >= max) state.cut = min;
    state.playing = true; resetFrame();
  };
  const setRate = (rate: number) => {
    if (PLAYBACK_RATES.includes(rate as PlaybackRate)) { state.rate = rate as PlaybackRate; resetFrame(); }
  };
  const tick = (now: number, hidden = false): boolean => {
    if (hidden || !state.playing || !Number.isFinite(now)) { resetFrame(); return false; }
    if (last === null) { last = now; return false; }
    const delta = now - last; last = now;
    // Browser suspension or a stalled main thread is not evidence of elapsed visible playback.
    if (delta <= 0 || delta > 250) return false;
    state.cut = Math.min(max, (state.cut ?? min) + (max - min) * delta * state.rate / durationMs);
    if (state.cut >= max) pause(); // Keep the final real timestamp; undated records never appear as births.
    return true;
  };
  return {available, snapshot, play, pause, seek, setRate, tick, resetFrame};
}
