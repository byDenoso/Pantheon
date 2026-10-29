import { useEffect, useState } from 'react';

type Timer = Pick<Window, 'setInterval' | 'clearInterval'>;
type Visibility = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/** Age continues to change even when a publication's fingerprint stays unchanged. */
export function startPublishedClock(onTick: (now: number) => void, timer: Timer, visibility: Visibility, now = Date.now) {
  const tick = () => { if (visibility.visibilityState === 'visible') onTick(now()); };
  const interval = timer.setInterval(tick, 30_000);
  visibility.addEventListener('visibilitychange', tick);
  return () => { timer.clearInterval(interval); visibility.removeEventListener('visibilitychange', tick); };
}

export function usePublishedClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => startPublishedClock(setNow, window, document), []);
  return now;
}
