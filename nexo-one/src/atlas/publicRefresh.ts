import type {PublicState} from './publicItems.ts';

type RefreshHost = {
  visible: () => boolean;
  later: (fn: () => void, delay: number) => () => void;
  onWake: (fn: () => void) => () => void;
};

const browserHost = (): RefreshHost => ({
  visible: () => !document.hidden,
  later: (fn, delay) => {const id = window.setTimeout(fn, delay); return () => window.clearTimeout(id);},
  onWake: fn => {
    window.addEventListener('focus', fn);
    document.addEventListener('visibilitychange', fn);
    return () => {window.removeEventListener('focus', fn); document.removeEventListener('visibilitychange', fn);};
  },
});

/** Public snapshots only: one request at a time, bounded, with the last valid display retained. */
export function startPublicRefresh(load: (signal: AbortSignal) => Promise<PublicState>,
  publish: (state: PublicState, delayed: boolean) => void,
  host: RefreshHost = browserHost(), intervalMs = 60_000, timeoutMs = 30_000): () => void {
  let closed = false, pending: AbortController | null = null;
  let cancelTimer = () => {}, current: PublicState | undefined, emitted: string | undefined;
  const emit = (state: PublicState, delayed: boolean) => {
    const key = JSON.stringify([state, delayed]);
    if (key !== emitted) {emitted = key; publish(state, delayed);}
  };
  const unavailable = () => emit(current || {status: 'unavailable', items: [], tests: []}, true);
  const refresh = async () => {
    if (closed || pending || !host.visible()) return;
    cancelTimer();
    const ac = new AbortController();
    pending = ac;
    let timedOut = false;
    const cancelDeadline = host.later(() => {timedOut = true; ac.abort();}, timeoutMs);
    try {
      const next = await load(ac.signal);
      if (closed || ac.signal.aborted) return;
      if (next.status === 'unavailable' || next.coverage === 'UNAVAILABLE' ||
          (current?.generatedAt && next.generatedAt && Date.parse(next.generatedAt) < Date.parse(current.generatedAt))) {
        unavailable();
      } else {current = next; emit(next, false);}
    } catch {
      if (!closed && (!ac.signal.aborted || timedOut)) unavailable();
    } finally {
      cancelDeadline();
      pending = null;
      if (!closed && host.visible()) cancelTimer = host.later(() => {void refresh();}, intervalMs);
    }
  };
  const wake = () => {
    if (host.visible()) void refresh();
    else {cancelTimer(); pending?.abort();}
  };
  const detach = host.onWake(wake);
  void refresh();
  return () => {closed = true; cancelTimer(); pending?.abort(); detach();};
}
