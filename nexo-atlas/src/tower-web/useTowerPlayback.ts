import {useCallback, useEffect, useMemo, useState} from 'react';
import {createPlaybackClock} from './playback.ts';

/** The graph updates at <= 12.5 Hz; the clock itself is independent of frame rate. */
export function useTowerPlayback(min: number, max: number, reducedMotion: boolean) {
  const clock = useMemo(() => createPlaybackClock(min, max), [min, max]);
  const [snapshot, setSnapshot] = useState(clock.snapshot);
  const update = useCallback(() => setSnapshot(clock.snapshot()), [clock]);
  useEffect(() => { update(); }, [update]);
  useEffect(() => { if (reducedMotion) { clock.pause(); update(); } }, [clock, reducedMotion, update]);
  useEffect(() => {
    if (!snapshot.playing || reducedMotion) return;
    let frame = 0, published = 0;
    const draw = (now: number) => {
      frame = 0;
      const changed = clock.tick(now, document.visibilityState === 'hidden');
      const playing = clock.snapshot().playing;
      if (changed && (now - published >= 80 || !playing)) { update(); published = now; }
      if (playing && document.visibilityState !== 'hidden') frame = requestAnimationFrame(draw);
    };
    const visibility = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; clock.resetFrame();
      if (document.visibilityState !== 'hidden') frame = requestAnimationFrame(draw);
    };
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => { if (frame) cancelAnimationFrame(frame); clock.resetFrame(); document.removeEventListener('visibilitychange', visibility); };
  }, [clock, snapshot.playing, reducedMotion, update]);
  const play = useCallback(() => { if (!reducedMotion) { clock.play(); update(); } }, [clock, reducedMotion, update]);
  const pause = useCallback(() => { clock.pause(); update(); }, [clock, update]);
  const seek = useCallback((cut: number | null) => { clock.seek(cut); update(); }, [clock, update]);
  const setRate = useCallback((rate: number) => { clock.setRate(rate); update(); }, [clock, update]);
  return {...snapshot, available: clock.available, play, pause, seek, setRate};
}
