import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {createPrivateSession, INITIAL_STATE, type PrivateController, type PrivateState} from '../privateSession.ts';

export function usePrivateSession() {
  const ctlRef = useRef<PrivateController | null>(null);
  const subs = useRef(new Set<() => void>());
  const notify = () => subs.current.forEach(f => f());

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try { ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('atlas-private') : null; } catch { ch = null; }
    const ctl = createPrivateSession({
      fetch: (u, i) => fetch(u, i),
      win: window,
      root: document.documentElement,
      channel: ch as unknown as import('../privateSession.ts').ChannelLike | null,
    });
    ctlRef.current = ctl;
    const unsub = ctl.subscribe(notify);
    ctl.start();
    notify();
    return () => { unsub(); ctl.dispose(); ctlRef.current = null; notify(); };
  }, []);

  const subscribe = useCallback((f: () => void) => { subs.current.add(f); return () => { subs.current.delete(f); }; }, []);
  const getSnapshot = useCallback((): PrivateState => ctlRef.current?.getSnapshot() ?? INITIAL_STATE, []);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    state,
    login: (pin: string) => ctlRef.current?.login(pin),
    logout: () => ctlRef.current?.logout(),
    retryRevocation: () => ctlRef.current?.retryRevocation(),
  };
}
