import type { AtlasApiClient } from '../api/types';
import type {
  AtlasDataSource,
  CampaignDetail,
  CampaignNode,
  DataEnvelope,
  DataIssue,
  DomainNode,
  Freshness,
  LearnerFilament,
  Provenance,
  SearchResult,
  SearchResultKind
} from './contracts';

type RawNode = { id: string; type?: string; label?: string; domain?: string; status?: string; summary?: string; [key: string]: unknown };
type RawGraph = { nodes?: RawNode[]; edges?: unknown[]; sourceVersion?: string; freshness?: string };
type RawHealth = {
  fingerprint?: string;
  sourceVersion?: string;
  dataSource?: { freshness?: string; sourceVersion?: string; source?: string; authority?: string };
};

// Map result kinds that must never become a graph node -- they always carry a
// targetRoute to a textual area instead. Kept in sync with the locked map contract
// in graph-entity-contract.ts.
const NON_MAP_KIND_ROUTES: Partial<Record<SearchResultKind, (id: string) => string>> = {
  TEST: id => `/pesquisa/testes/${encodeURIComponent(id)}`,
  CLAIM: id => `/laboratorio?kind=CLAIM&id=${encodeURIComponent(id)}`,
  DATASET: id => `/laboratorio?kind=DATASET&id=${encodeURIComponent(id)}`,
  ARTIFACT: id => `/laboratorio?kind=ARTIFACT&id=${encodeURIComponent(id)}`
};

function normalizeFreshness(value: string | undefined): Freshness {
  const upper = String(value || '').toUpperCase();
  if (upper === 'LIVE') return 'LIVE';
  if (upper === 'SNAPSHOT') return 'SNAPSHOT';
  if (upper === 'STALE' || upper === 'FALLBACK') return 'STALE';
  if (upper === 'DEGRADED') return 'DEGRADED';
  return 'UNKNOWN';
}

function baseProvenance(source: string, sourceVersion?: string, url?: string): Provenance[] {
  return [{ source, sourceRef: sourceVersion, observedAt: sourceVersion, url, label: source }];
}

/**
 * Reads the sanitized public static snapshot through the existing AtlasApiClient
 * (createStaticArtifactApi under the hood in production, network-blocked-safe by
 * design since it only ever hits same-origin /data/* artifacts). Normalizes every
 * response into the locked DataEnvelope shape. Never returns a TEST/CLAIM/DATASET/
 * ARTIFACT node as part of a DomainNode/CampaignNode list -- those kinds only ever
 * appear from search(), always carrying a targetRoute instead of a graph position.
 */
export class PublicSnapshotSource implements AtlasDataSource {
  private readonly api: AtlasApiClient;

  constructor(api: AtlasApiClient) {
    this.api = api;
  }

  private async healthEnvelope(): Promise<{ freshness: Freshness; fingerprint?: string; sourceVersion?: string }> {
    try {
      const health = (await this.api.health()) as RawHealth;
      return {
        freshness: normalizeFreshness(health?.dataSource?.freshness),
        fingerprint: health?.fingerprint,
        sourceVersion: health?.sourceVersion
      };
    } catch {
      return { freshness: 'UNKNOWN' };
    }
  }

  async getDomains(): Promise<DataEnvelope<DomainNode[]>> {
    const meta = await this.healthEnvelope();
    try {
      const graph = (await this.api.graph({ focus: 'system:NEXO' })) as RawGraph;
      const domains: DomainNode[] = (graph.nodes || [])
        .filter(node => String(node.type || '').toUpperCase() === 'DOMAIN')
        .map(node => ({ id: node.id, type: 'DOMAIN', label: String(node.label || node.id), summary: node.summary }));
      return {
        data: domains,
        state: domains.length ? 'READY' : 'EMPTY',
        freshness: meta.freshness,
        fingerprint: meta.fingerprint,
        sourceVersion: meta.sourceVersion,
        provenance: baseProvenance('GITHUB · TOWER_V06 (publicado via GOOGLE_DRIVE)', meta.sourceVersion),
        issues: []
      };
    } catch (error) {
      return errorEnvelope(error, meta.freshness);
    }
  }

  async getDomainCampaigns(domainId: string): Promise<DataEnvelope<CampaignNode[]>> {
    const meta = await this.healthEnvelope();
    try {
      const focus = domainId.startsWith('domain:') ? domainId : `domain:${domainId}`;
      const graph = (await this.api.graph({ focus })) as RawGraph;
      const campaigns: CampaignNode[] = (graph.nodes || [])
        .filter(node => String(node.type || '').toUpperCase() === 'CAMPAIGN')
        .map(node => ({
          id: node.id,
          type: 'CAMPAIGN',
          label: String(node.label || node.id),
          domainId: focus,
          status: node.status,
          summary: node.summary
        }));
      return {
        data: campaigns,
        state: campaigns.length ? 'READY' : 'EMPTY',
        freshness: meta.freshness,
        fingerprint: meta.fingerprint,
        sourceVersion: meta.sourceVersion,
        provenance: baseProvenance('GITHUB · TOWER_V06 (publicado via GOOGLE_DRIVE)', meta.sourceVersion),
        issues: []
      };
    } catch (error) {
      return errorEnvelope(error, meta.freshness);
    }
  }

  async getCampaign(campaignId: string): Promise<DataEnvelope<CampaignDetail>> {
    const meta = await this.healthEnvelope();
    try {
      const result = (await this.api.entity(campaignId)) as { entity?: RawNode; relations?: Array<{ id?: string; target: string; type?: string }> };
      if (!result?.entity) {
        return { data: null, state: 'EMPTY', freshness: meta.freshness, provenance: [], issues: [] };
      }
      const detail: CampaignDetail = {
        id: result.entity.id,
        type: 'CAMPAIGN',
        label: String(result.entity.label || result.entity.id),
        domainId: result.entity.domain ? `domain:${result.entity.domain}` : null,
        status: result.entity.status,
        summary: result.entity.summary,
        provenance: baseProvenance('GITHUB · TOWER_V06', meta.sourceVersion),
        relations: (result.relations || []).map((edge, index) => ({ id: edge.id || `rel-${index}`, targetId: edge.target, type: edge.type || 'RELATES_TO' }))
      };
      return {
        data: detail,
        state: 'READY',
        freshness: meta.freshness,
        fingerprint: meta.fingerprint,
        sourceVersion: meta.sourceVersion,
        provenance: detail.provenance,
        issues: []
      };
    } catch (error) {
      return errorEnvelope(error, meta.freshness);
    }
  }

  async search(query: string): Promise<DataEnvelope<SearchResult[]>> {
    const meta = await this.healthEnvelope();
    const trimmed = query.trim();
    if (!trimmed) return { data: [], state: 'EMPTY', freshness: meta.freshness, provenance: [], issues: [] };
    try {
      const graph = (await this.api.graph({ mode: 'search', q: trimmed, limit: 40 })) as RawGraph;
      const results: SearchResult[] = (graph.nodes || []).map(node => {
        const kind = String(node.type || 'ENTITY').toUpperCase() as SearchResultKind;
        const nonMapRoute = NON_MAP_KIND_ROUTES[kind];
        if (nonMapRoute) {
          return { id: node.id, kind, label: String(node.label || node.id), targetRoute: nonMapRoute(node.id) };
        }
        if (kind === 'DOMAIN' || kind === 'CAMPAIGN') {
          return { id: node.id, kind, label: String(node.label || node.id), graphId: node.id };
        }
        // Any other/unknown kind: never invent a map position for it either --
        // route it to Pesquisa's generic lookup rather than the map.
        return { id: node.id, kind: 'ARTIFACT', label: String(node.label || node.id), targetRoute: `/pesquisa?entity=${encodeURIComponent(node.id)}` };
      });
      return {
        data: results,
        state: results.length ? 'READY' : 'EMPTY',
        freshness: meta.freshness,
        fingerprint: meta.fingerprint,
        sourceVersion: meta.sourceVersion,
        provenance: baseProvenance('GITHUB · TOWER_V06 (índice de busca publicado)', meta.sourceVersion),
        issues: []
      };
    } catch (error) {
      return errorEnvelope(error, meta.freshness);
    }
  }

  async getLearnerLayer(): Promise<DataEnvelope<LearnerFilament[]>> {
    // The public static snapshot (public/data/**) carries no scheduler/Learner field
    // today -- confirmed by inspecting the generated artifacts, not assumed. Returning
    // an honest DATA_UNAVAILABLE here is the correct behavior under the "never invent
    // a line to a state we can't prove" rule; it is not a bug to fix by fabricating a
    // filament.
    const meta = await this.healthEnvelope();
    return {
      data: [],
      state: 'DATA_UNAVAILABLE',
      freshness: meta.freshness,
      provenance: [],
      issues: [{ code: 'LEARNER_FIELD_NOT_PUBLISHED', severity: 'INFO', message: 'O snapshot público atual não publica estado do scheduler Learner.' }]
    };
  }
}

function errorEnvelope<T>(error: unknown, freshness: Freshness): DataEnvelope<T> {
  const issue: DataIssue = { code: 'SOURCE_READ_FAILED', severity: 'ERROR', message: error instanceof Error ? error.message : String(error) };
  return { data: null, state: 'API_ERROR', freshness, provenance: [], issues: [issue] };
}
