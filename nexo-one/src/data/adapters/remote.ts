// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// O frontend consome SystemState v1 diretamente do backend NEXO em GET /api/system.
// O payload já contém o grafo canônico projetado para o Atlas em state.graph.
// Builds estáticos podem fornecer VITE_SYSTEM_ENDPOINT para uma projeção JSON.
// ============================================================================
import type { SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

const configuredSystemEndpoint = import.meta.env?.VITE_SYSTEM_ENDPOINT?.trim();

export function resolveSystemEndpoint(
  configuredEndpoint: string | undefined,
  baseUrl = import.meta.env?.BASE_URL || '/',
): string {
  if (!configuredEndpoint) return '/api/system';

  // Absolute URLs and root-absolute paths already have an unambiguous origin.
  if (/^[a-z][a-z\d+.-]*:/i.test(configuredEndpoint)
      || configuredEndpoint.startsWith('//')
      || configuredEndpoint.startsWith('/')) {
    return configuredEndpoint;
  }

  // Vite multi-page builds share one BASE_URL. Resolve relative static assets
  // against that deployment root, not against the current document directory.
  // Otherwise /Pantheon/atlas3d/ + ./system.json incorrectly becomes
  // /Pantheon/atlas3d/system.json instead of /Pantheon/system.json.
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${configuredEndpoint.replace(/^\.\//, '')}`;
}

export const SYSTEM_ENDPOINT = resolveSystemEndpoint(configuredSystemEndpoint);

// Several views (cockpit, Atlas, science) mount at once and each asks for the
// SystemState. Non-forced loads share one request for a short window instead
// of downloading the same projection N times.
const SHARE_WINDOW_MS = 3_000;
let shared: { at: number; promise: Promise<SystemState> } | null = null;

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => { signal.removeEventListener('abort', onAbort); resolve(value); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO · SystemState público',
  kind: 'remote',

  async load({ signal, force }): Promise<SystemState> {
    if (!force && shared && Date.now() - shared.at < SHARE_WINDOW_MS) return abortable(shared.promise, signal);
    const promise = loadSystemState(Boolean(force));
    shared = { at: Date.now(), promise };
    promise.catch(() => { if (shared?.promise === promise) shared = null; });
    return abortable(promise, signal);
  },
};

async function loadSystemState(force: boolean): Promise<SystemState> {
    const endpointPath = SYSTEM_ENDPOINT.split('?', 1)[0] ?? SYSTEM_ENDPOINT;
    const staticProjection = endpointPath.endsWith('.json');
    const separator = SYSTEM_ENDPOINT.includes('?') ? '&' : '?';
    const refresh = force && !staticProjection ? `${separator}refresh=1` : '';
    const requestUrl = `${SYSTEM_ENDPOINT}${refresh}`;

    // No per-caller signal here: the request is shared; callers abort their own wait.
    const response = await fetch(requestUrl, {
      // Static Pages assets keep a stable URL so the browser/CDN can revalidate
      // with ETag/Last-Modified instead of downloading a timestamp-busted copy.
      cache: staticProjection ? (force ? 'reload' : 'no-cache') : 'no-store',
    });

    if (response.status === 404) {
      throw new DataSourceError(
        'NOT_CONNECTED',
        `${SYSTEM_ENDPOINT} não está publicado nesta implantação.`,
      );
    }

    if (!response.ok) {
      throw new DataSourceError(
        'UNAVAILABLE',
        'O servidor não retornou o estado público do sistema.',
      );
    }

    return assertSystemState(await response.json());
}
