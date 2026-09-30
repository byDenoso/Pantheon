/** Share only in-flight JSON reads. Completed publications are revalidated. */
const requests = new Map<string, Promise<unknown>>();

function waitFor<T>(request: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    request.then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

export function fetchSharedJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const { signal, ...options } = init;
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  options.cache ??= 'no-cache';

  const method = String(options.method || 'GET').toUpperCase();
  const share = method === 'GET' && options.body == null;
  const headers = [...new Headers(options.headers)].sort(([a], [b]) => a.localeCompare(b));
  const key = `${url}|${method}|${options.cache}|${JSON.stringify(headers)}`;
  const current = share ? requests.get(key) : undefined;
  if (current) return waitFor(current as Promise<T>, signal);

  // Cancellation belongs to the caller waiting for a shared response. One
  // unmount must not abort the fetch needed by another mounted surface.
  const request = fetch(url, options).then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${url}`);
    return await response.json() as T;
  });

  if (share) {
    requests.set(key, request);
    const release = () => { if (requests.get(key) === request) requests.delete(key); };
    void request.then(release, release);
  }
  return waitFor(request, signal);
}

export function clearSharedJson(url?: string): void {
  if (!url) { requests.clear(); return; }
  for (const key of requests.keys()) if (key.startsWith(`${url}|`)) requests.delete(key);
}
