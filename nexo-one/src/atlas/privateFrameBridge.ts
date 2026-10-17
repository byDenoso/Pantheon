// Parent side of the parent <-> private-frame protocol. Pure and injectable.
// Only messages whose origin AND source match the guarded frame are honoured; the runtime
// is posted solely to that frame with an explicit same-origin targetOrigin.
import {HOST, isFrameLocale, parseFromFrame, trusted, type ToFrame} from './frameProtocol.ts';

type Target = {addEventListener(t: 'message', f: (e: any) => void): void; removeEventListener(t: 'message', f: (e: any) => void): void};
type FrameWin = {postMessage(m: unknown, targetOrigin: string): void};

export type BridgeDeps = {
  win: Target;
  origin: string;
  getFrameWindow: () => FrameWin | null;
  getData: () => unknown;
  /** the shell's current language; sent to the frame before the runtime and again whenever setLocale is called */
  getLocale?: () => string;
  onReady?: () => void;
  /** the frame validated and mounted the runtime */
  onAccepted?: () => void;
  onLogout: () => void;
  onError: (code: string) => void;
  /**
   * The frame asked for a NEW generation. Must revalidate the session and re-fetch the private runtime, resolving with the
   * fresh data. Rejections: `{fatal:true}` (session/source lost: the whole area is torn down) or a transient `{fatal:false}`.
   */
  onRefresh?: (signal: AbortSignal) => Promise<unknown>;
  refreshTimeoutMs?: number;
  /** called with the fresh data only after it was handed to the frame */
  onRefreshed?: (data: unknown) => void;
  /** Execute one allowlisted read-only retrieval call outside the network-closed frame. */
  onRetrieval?: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
  retrievalTimeoutMs?: number;
};
export class RefreshError extends Error {
  fatal: boolean; code: string;
  constructor(code: string, fatal: boolean) { super(code); this.name = 'RefreshError'; this.code = code; this.fatal = fatal; }
}

export function createFrameBridge(d: BridgeDeps) {
  let disposed = false;
  const send = (m: ToFrame) => {
    const fw = d.getFrameWindow();
    if (!fw || d.origin === 'null' || d.origin === '') return false;
    fw.postMessage(m, d.origin);
    return true;
  };
  let ready = false;
  /** only a supported locale is ever sent; anything else is dropped here (the frame validates again) */
  const sendLocale = (locale: unknown) => (isFrameLocale(locale) ? send({channel: HOST, type: 'LOCALE', locale}) : false);
  const onMessage = (ev: {origin: string; source: unknown; data: unknown}) => {
    if (disposed) return;
    const fw = d.getFrameWindow();
    if (!trusted(ev, d.origin, fw)) return;
    const msg = parseFromFrame(ev.data);
    if (!msg) return;
    if (msg.type === 'READY') {
      const data = d.getData();
      if (data == null) return;
      sendLocale(d.getLocale?.()); // language first, so the frame's first paint is already in the shell's language
      if (send({channel: HOST, type: 'RUNTIME', data})) { ready = true; d.onReady?.(); }
    } else if (msg.type === 'ACCEPTED') d.onAccepted?.();
    else if (msg.type === 'SESSION_ACTION') d.onLogout();
    else if (msg.type === 'REFRESH') refresh(msg.id);
    else if (msg.type === 'RETRIEVAL') retrieval(msg.id, msg.name, msg.args);
    else d.onError(msg.code);
  };
  // single-flight: concurrent REFRESH requests share one revalidation; each caller still gets its own reply id
  let inflight: Promise<unknown> | null = null;
  let refreshAbort: AbortController | null = null;
  const refresh = (id: string) => {
    if (!d.onRefresh) { send({channel: HOST, type: 'REFRESH_FAILED', id, code: 'REFRESH_UNSUPPORTED'}); return; }
    if (!inflight) {
      const controller = new AbortController(); refreshAbort = controller;
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new RefreshError('ABORTED', false)), {once: true});
        timer = setTimeout(() => { reject(new RefreshError('TIMEOUT', false)); controller.abort(); }, d.refreshTimeoutMs ?? 25_000);
      });
      let work: Promise<unknown>;
      try { work = d.onRefresh(controller.signal); } catch (e) { work = Promise.reject(e); }
      const operation = Promise.race([work, timeout]).finally(() => {
        clearTimeout(timer);
        if (inflight === operation) { inflight = null; refreshAbort = null; }
      });
      inflight = operation;
    }
    const p = inflight;
    p.then(data => {
      if (disposed || d.getFrameWindow() == null) return; // torn down meanwhile: drop the stale result
      if (send({channel: HOST, type: 'RUNTIME_REFRESH', id, data})) d.onRefreshed?.(data);
    }, (e: unknown) => {
      if (disposed) return;
      const fatal = !(e instanceof RefreshError) || e.fatal;
      const code = e instanceof RefreshError ? e.code : 'REFRESH_FAILED';
      if (fatal) d.onError(code); else send({channel: HOST, type: 'REFRESH_FAILED', id, code});
    });
  };
  const retrievals = new Map<string, AbortController>();
  const retrieval = (id: string, name: string, args: Record<string, unknown>) => {
    if (!d.onRetrieval) { send({channel: HOST, type: 'RETRIEVAL_RESULT', id, ok: false, code: 'RETRIEVAL_UNAVAILABLE'}); return; }
    if (retrievals.has(id)) return;
    const controller = new AbortController(); retrievals.set(id, controller);
    const timer = setTimeout(() => controller.abort(), d.retrievalTimeoutMs ?? 30_000);
    Promise.resolve().then(() => d.onRetrieval!(name, args, controller.signal)).then(
      data => { if (!disposed) send({channel: HOST, type: 'RETRIEVAL_RESULT', id, ok: true, data}); },
      error => {
        if (disposed) return;
        const raw = String((error as {code?: unknown})?.code ?? (error as Error)?.message ?? 'RETRIEVAL_UNAVAILABLE');
        const code = /^[A-Z_]{3,80}$/.test(raw) ? raw : controller.signal.aborted ? 'RETRIEVAL_TIMEOUT' : 'RETRIEVAL_UNAVAILABLE';
        send({channel: HOST, type: 'RETRIEVAL_RESULT', id, ok: false, code});
      },
    ).finally(() => { clearTimeout(timer); retrievals.delete(id); });
  };
  d.win.addEventListener('message', onMessage);
  return {
    /** Tells the frame the shell's language changed. Nothing is sent before the frame said READY or after dispose. */
    setLocale(locale: string) { return !disposed && ready ? sendLocale(locale) : false; },
    dispose() {
      if (disposed) return;
      send({channel: HOST, type: 'TEARDOWN'}); // best effort: the frame is usually removed right after
      disposed = true;
      refreshAbort?.abort();
      for (const controller of retrievals.values()) controller.abort(); retrievals.clear();
      d.win.removeEventListener('message', onMessage);
    },
  };
}
