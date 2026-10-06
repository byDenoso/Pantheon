// In-memory adapter at the fetch boundary of the private frame. Every legacy
// consumer that still calls fetch() is answered from the single runtime
// generation. Anything not listed is denied (never forwarded to the network).
import type {RuntimeHolder} from './runtime.ts';

export type DeniedLog = (path: string, reason: 'NO_ADAPTER' | 'FOREIGN_ORIGIN' | 'METHOD') => void;
const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});

export function createPrivateFetch(holder: RuntimeHolder, origin: string, onDenied?: DeniedLog) {
  return async (input: unknown, init?: {method?: string}): Promise<Response> => {
    let raw: string;
    let method = init?.method;
    if (typeof input === 'string') raw = input;
    else if (input instanceof URL) raw = input.href;
    else if (input && typeof (input as {url?: unknown}).url === 'string') { raw = (input as {url: string}).url; method ??= (input as {method?: string}).method; }
    else raw = String(input);
    let url: URL;
    try { url = new URL(raw, `${origin}/`); } catch { onDenied?.(raw, 'NO_ADAPTER'); return j({error: 'PRIVATE_ADAPTER_MISSING'}, 501); }
    if (url.origin !== origin) { onDenied?.(url.origin, 'FOREIGN_ORIGIN'); return j({error: 'PRIVATE_ADAPTER_MISSING'}, 501); }
    if ((method ?? 'GET').toUpperCase() !== 'GET') { onDenied?.(url.pathname, 'METHOD'); return j({error: 'PRIVATE_ADAPTER_MISSING'}, 501); }
    const rt = holder.get();
    if (!rt) return j({error: 'PRIVATE_RUNTIME_NOT_LOADED'}, 503);
    const p = url.pathname;
    const section = (v: unknown) => (v ? j(v) : j({error: 'NOT_CONNECTED'}, 404));
    if (/\/api\/system$/.test(p)) return j(rt.system);
    if (/\/api\/world$/.test(p)) return new Response(`${JSON.stringify(rt.world)}\n`, {status: 200, headers: {'content-type': 'application/x-ndjson', 'cache-control': 'no-store'}});
    if (/\/mcp\/topology\.json$/.test(p)) return section(rt.topology);
    if (/\/tower-projection\/publication\.json$/.test(p)) return section(rt.publication);
    if (/\/galaxy\/latest\.json$/.test(p)) return section(rt.galaxy);
    if (/\/build-meta\.json$/.test(p)) return section(rt.publication?.build_meta);
    onDenied?.(p, 'NO_ADAPTER');
    return j({error: 'PRIVATE_ADAPTER_MISSING'}, 501);
  };
}
