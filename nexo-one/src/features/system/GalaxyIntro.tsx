// Short cinematic intro. The galaxy itself is already visible underneath (Atlas.tsx
// mounts AtlasCanvas25D immediately, not after this overlay) — this only adds a
// few seconds of copy on top, then gets out of the way. Plays once per browser
// session and never blocks or replaces the galaxy; prefers-reduced-motion skips
// it outright instead of racing a reduced-motion viewer through animation.
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../app/useMediaQuery.ts';

const SESSION_KEY = 'nexo-galaxy-intro-seen';
const TITLE_AT_MS = 900;
const ARMS_AT_MS = 3400;
const DONE_AT_MS = 6200;

function alreadySeen(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
function markSeen(): void {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* no session storage: intro plays again, harmless */ }
}

type Phase = 'core' | 'title' | 'arms';

export function GalaxyIntro({ onDone }: { onDone: () => void }) {
  const reducedMotion = usePrefersReducedMotion();
  const skip = reducedMotion || alreadySeen();
  const [visible, setVisible] = useState(!skip);
  const [phase, setPhase] = useState<Phase>('core');

  useEffect(() => {
    if (skip) { onDone(); return; }
    markSeen();
    const timers = [
      window.setTimeout(() => setPhase('title'), TITLE_AT_MS),
      window.setTimeout(() => setPhase('arms'), ARMS_AT_MS),
      window.setTimeout(() => { setVisible(false); onDone(); }, DONE_AT_MS),
    ];
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  const finish = () => { setVisible(false); onDone(); };

  return (
    <div className={`galaxy-intro phase-${phase}`} role="dialog" aria-label="Introdução ao NEXO ONE"
      onClick={finish}>
      <div className="galaxy-intro-copy">
        <span className="galaxy-intro-kicker">TOWER_V06 · NEXO ONE</span>
        <h1>THIS IS NEXO</h1>
        <p>Um sistema vivo — ciência, engenharia e execução em um único mapa.</p>
      </div>
      <button type="button" className="galaxy-intro-skip" aria-label="Pular introdução"
        onClick={event => { event.stopPropagation(); finish(); }}>Pular →</button>
    </div>
  );
}
