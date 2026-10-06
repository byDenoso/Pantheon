// Synthetic contract mock. No real hosts, identifiers or credentials.
export const json = (body, status = 200, ct = 'application/json; charset=utf-8', extra = {}) => {
  const res = new Response(body === undefined ? null : JSON.stringify(body), {status: status === 204 ? 200 : status, headers: {'content-type': ct}});
  if (status === 204) Object.defineProperty(res, 'status', {value: 204});
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(res, k, {value: v});
  return res;
};
export const raw = (text, status = 200, ct = 'text/html') => new Response(text, {status, headers: {'content-type': ct}});

/** Deferred promise so a test decides exactly when a response "arrives". */
export const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };

export const SYN_DATA = {alpha: {beta: 1, list: ['x', 'y']}, label: 'synthetic'};
export const FUTURE = () => new Date(Date.now() + 3_600_000).toISOString();

/** Minimal router-style fetch mock. handlers: {'METHOD path': (init, signal) => Response|Promise<Response>} */
export function mockFetch(handlers, calls = []) {
  const fn = (url, init = {}) => {
    const method = init.method ?? 'GET';
    const key = `${method} ${String(url).split('?')[0]}`;
    calls.push({method, url: String(url), init});
    const h = handlers[key];
    if (!h) return Promise.resolve(raw('nf', 404));
    const signal = init.signal;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})));
      Promise.resolve(h(init, signal)).then(resolve, reject);
    });
  };
  fn.calls = calls;
  return fn;
}

export const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

export function fakeTarget() {
  const m = new Map();
  return {
    addEventListener(t, f) { (m.get(t) ?? m.set(t, new Set()).get(t)).add(f); },
    removeEventListener(t, f) { m.get(t)?.delete(f); },
    emit(t, e = {}) { [...(m.get(t) ?? [])].forEach(f => f(e)); },
    count(t) { return m.get(t)?.size ?? 0; },
    location: {hash: ''},
  };
}
export function fakeRoot() { const a = new Map(); return {setAttribute: (k, v) => a.set(k, v), removeAttribute: k => a.delete(k), get: k => a.get(k)}; }
export function fakeChannelPair() {
  const mk = () => ({onmessage: null, peer: null, closed: false, postMessage(m) { if (this.peer && !this.peer.closed) queueMicrotask(() => this.peer.onmessage?.({data: m})); }, close() { this.closed = true; }});
  const a = mk(), b = mk(); a.peer = b; b.peer = a; return [a, b];
}
