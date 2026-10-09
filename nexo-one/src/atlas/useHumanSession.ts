import {useEffect, useRef, useState} from 'react';
import {isObj, type Fetch} from './api.ts';

type HumanSession = {configured: boolean; authenticated: boolean; access: 'PUBLIC' | 'PRIVATE'; mode: 'PUBLIC_READ_ONLY' | 'PRIVATE'};
type Method = 'GET' | 'POST' | 'DELETE';
const PUBLIC: HumanSession = {configured: false, authenticated: false, access: 'PUBLIC', mode: 'PUBLIC_READ_ONLY'};
const errors = new Set(['AUTH_REQUIRED', 'AUTH_NOT_CONFIGURED', 'RATE_LIMITED', 'ORIGIN_NOT_ALLOWED']);

/** Same existing native cookie/backend; no token, storage, bridge or alternate origin. */
export async function requestHumanSession(fetchImpl: Fetch, method: Method, password = '', signal?: AbortSignal): Promise<HumanSession> {
  if (method === 'POST' && (typeof password !== 'string' || password.length < 8 || password.length > 128)) throw new Error('AUTH_REQUIRED');
  const response = await fetchImpl('/api/session', {method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    ...(method === 'GET' ? {signal} : {}), headers: {Accept: 'application/json', ...(method === 'POST' ? {'Content-Type': 'application/json'} : {})},
    ...(method === 'POST' ? {body: JSON.stringify({password})} : {})});
  if (response.redirected || ['opaque', 'opaqueredirect'].includes(response.type)
      || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error('AUTH_UNAVAILABLE');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 4096) throw new Error('AUTH_UNAVAILABLE');
  let value: unknown;
  try {value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));} catch {throw new Error('AUTH_UNAVAILABLE');}
  if (!isObj(value)) throw new Error('AUTH_UNAVAILABLE');
  if (response.status !== 200) throw new Error(typeof value.error === 'string' && errors.has(value.error) ? value.error : 'AUTH_UNAVAILABLE');
  if (typeof value.configured !== 'boolean' || typeof value.authenticated !== 'boolean'
      || (value.authenticated && (!value.configured || value.access !== 'PRIVATE' || value.mode !== 'PRIVATE'))
      || (!value.authenticated && (value.access !== 'PUBLIC' || value.mode !== 'PUBLIC_READ_ONLY'))
      || (method === 'POST' && !value.authenticated) || (method === 'DELETE' && value.authenticated)) throw new Error('AUTH_UNAVAILABLE');
  return {configured: value.configured, authenticated: value.authenticated, access: value.access as HumanSession['access'], mode: value.mode as HumanSession['mode']};
}

export function useHumanSession() {
  const [session, setSession] = useState<HumanSession>(PUBLIC), [error, setError] = useState('');
  const [pending, setPending] = useState(false), [runtimeAvailable, setRuntimeAvailable] = useState<boolean | null>(null);
  const generation = useRef(0), flight = useRef(false);
  useEffect(() => {
    const token = ++generation.current, controller = new AbortController();
    void requestHumanSession(fetch, 'GET', '', controller.signal).then(value => {
      if (token === generation.current) {setSession(value); setRuntimeAvailable(true);}
    }).catch(() => {if (token === generation.current) {setRuntimeAvailable(false); setError('AUTH_UNAVAILABLE');}});
    return () => {generation.current++; controller.abort();};
  }, []);
  const mutate = async (method: 'POST' | 'DELETE', password = '') => {
    if (flight.current) return false;
    const token = ++generation.current; flight.current = true; setPending(true); setError('');
    if (method === 'DELETE') setSession(previous => ({...previous, authenticated: false, access: 'PUBLIC', mode: 'PUBLIC_READ_ONLY'}));
    try {
      const value = await requestHumanSession(fetch, method, password);
      if (token !== generation.current) return false;
      setSession(value); setRuntimeAvailable(true); return true;
    } catch (reason) {
      if (token === generation.current) {
        setSession(previous => ({...previous, authenticated: false, access: 'PUBLIC', mode: 'PUBLIC_READ_ONLY'}));
        setError(reason instanceof Error && errors.has(reason.message) ? reason.message : 'AUTH_UNAVAILABLE');
      }
      return false;
    } finally {flight.current = false; if (token === generation.current) setPending(false);}
  };
  return {session, error, pending, runtimeAvailable, runtime: 'VERCEL_NATIVE' as const,
    login: (password: string) => mutate('POST', password), logout: () => mutate('DELETE')};
}
