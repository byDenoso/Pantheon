// A narrow exception to the legacy frame's closed network boundary. The native
// fetch handle is captured before guards, never exported. No caller-supplied URL.
export function createMemoryTransport(nativeFetch: typeof fetch) {
  return async (action: 'browse' | 'propose', body: Record<string, unknown>, signal?: AbortSignal) => {
    if (action !== 'browse' && action !== 'propose') throw new Error('MEMORY_ACTION_DENIED');
    const response = await nativeFetch('/api/atlas-memory/' + action, {
      method:'POST', credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal,
    });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(typeof value?.error === 'string' ? value.error : 'MEMORY_UNAVAILABLE'), {status:response.status});
    return value;
  };
}
