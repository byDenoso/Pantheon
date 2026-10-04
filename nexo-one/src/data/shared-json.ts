/** Share only in-flight JSON reads. Completed publications are revalidated. */
interface SharedRequest {
  url: string;
  promise: Promise<unknown>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
  release: () => void;
}
const requests = new Map<string, SharedRequest>();
const abortReason = (signal: AbortSignal) => signal.reason ?? new DOMException('Aborted', 'AbortError');

async function readJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${url}`);
  return await response.json() as T;
}

function waitFor<T>(request: SharedRequest, signal?: AbortSignal | null): Promise<T> {
  request.consumers += 1;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener('abort', abort);
      request.consumers -= 1;
      if (!request.consumers && !request.settled) {
        // Another surface may still need this read; only the last consumer cancels it.
        request.release();
        request.controller.abort();
      }
      return true;
    };
    const abort = () => { if (finish()) reject(abortReason(signal!)); };
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    request.promise.then(
      value => { if (finish()) resolve(value as T); },
      error => { if (finish()) reject(error); },
    );
  });
}

export function fetchSharedJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const {signal, ...options} = init;
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  options.cache ??= 'no-cache';
  const method = String(options.method || 'GET').toUpperCase();
  // Unshared requests retain their caller's actual network cancellation.
  if (method !== 'GET' || options.body != null) return readJson<T>(url, {...options, signal});

  const headers = [...new Headers(options.headers)].sort(([a], [b]) => a.localeCompare(b));
  // Include credentials, mode, redirect, integrity, etc. Different security/cache
  // semantics must never accidentally share the same response.
  const key = JSON.stringify([url, Object.entries({...options, method, headers}).sort(([a], [b]) => a.localeCompare(b))]);
  let current = requests.get(key);
  if (!current) {
    const controller = new AbortController();
    const entry: SharedRequest = {
      url, controller, consumers: 0, settled: false,
      promise: readJson<T>(url, {...options, signal: controller.signal}),
      release: () => { if (requests.get(key) === entry) requests.delete(key); },
    };
    current = entry;
    requests.set(key, entry);
    const settle = () => { entry.settled = true; entry.release(); };
    void entry.promise.then(settle, settle);
  }
  return waitFor<T>(current, signal);
}

/** Evict deduplication entries without disrupting consumers already waiting. */
export function clearSharedJson(url?: string): void {
  if (url === undefined) { requests.clear(); return; }
  for (const [key, entry] of requests) if (entry.url === url) requests.delete(key);
}
