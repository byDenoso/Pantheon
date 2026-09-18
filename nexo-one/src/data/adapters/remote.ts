// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// O frontend consome SystemState v1. Em runtime normal usa GET /api/system e
// hidrata o Atlas pelo endpoint dedicado GET /api/atlas-graph, mantendo /api/system
// como fallback canônico. Builds estáticos
// podem fornecer VITE_SYSTEM_ENDPOINT para uma projeção JSON junto dos assets.
// ============================================================================
import type { GraphEdge, GraphNode, SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

const configuredSystemEndpoint = import.meta.env?.VITE_SYSTEM_ENDPOINT?.trim();
export const SYSTEM_ENDPOINT = configuredSystemEndpoint || '/api/system';
export const ATLAS_GRAPH_ENDPOINT = '/api/atlas-graph';

type AtlasGraphPayload = {
  contract_version: '1';
  generated_at: string;
  bus_fingerprint: string | null;
  state: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
};

function assertAtlasGraph(value: unknown): AtlasGraphPayload {
  const payload = value as AtlasGraphPayload;
  if (!payload
    || payload.contract_version !== '1'
    || !payload.graph
    || !Array.isArray(payload.graph.nodes)
    || !Array.isArray(payload.graph.edges)) {
    throw new DataSourceError('CONTRACT_MISMATCH', 'A resposta do Atlas não obedece ao contrato de grafo v1.');
  }
  return payload;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { signal, cache: 'no-store' });
}

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO · SystemState público + Atlas graph',
  kind: 'remote',
  async load({ signal }): Promise<SystemState> {
    const requestUrl = SYSTEM_ENDPOINT.endsWith('.json')
      ? `${SYSTEM_ENDPOINT}${SYSTEM_ENDPOINT.includes('?') ? '&' : '?'}v=${Date.now()}`
      : SYSTEM_ENDPOINT;

    const staticProjection = SYSTEM_ENDPOINT.endsWith('.json');
    const [systemResponse, atlasResponse] = await Promise.all([
      fetchJson(requestUrl, signal),
      staticProjection
        ? Promise.resolve(null)
        : fetchJson(`${ATLAS_GRAPH_ENDPOINT}?v=${Date.now()}`, signal).catch(() => null),
    ]);

    if (systemResponse.status === 404) {
      throw new DataSourceError('NOT_CONNECTED', `${SYSTEM_ENDPOINT} não está publicado nesta implantação.`);
    }
    if (!systemResponse.ok) {
      throw new DataSourceError('UNAVAILABLE', 'O servidor não retornou o estado público do sistema.');
    }

    const state = assertSystemState(await systemResponse.json());

    if (atlasResponse?.ok) {
      const atlas = assertAtlasGraph(await atlasResponse.json());
      state.graph = atlas.graph;
    }

    return state;
  },
};
