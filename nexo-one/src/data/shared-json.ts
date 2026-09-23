/** Request cache shared by SPA routes. Failed requests are evicted so retry works. */
const requests = new Map<string, Promise<unknown>>();

export function fetchSharedJson<T>(url: string, init?: RequestInit): Promise<T> {
  const key = `${url}|${init?.cache ?? 'default'}`;
  const current = requests.get(key);
  if (current) return current as Promise<T>;
  const request = fetch(url, init).then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${url}`);
    return await response.json() as T;
  }).catch(error => {
    requests.delete(key);
    throw error;
  });
  requests.set(key, request);
  return request as Promise<T>;
}

export function clearSharedJson(url?: string): void {
  if (!url) { requests.clear(); return; }
  for (const key of requests.keys()) if (key.startsWith(`${url}|`)) requests.delete(key);
}
