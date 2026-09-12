import type {
  AtlasContext,
  DatasetMeasurement,
  DirectionalSignal,
  Freshness,
  FreshnessState,
  HealthPayload,
  ParameterEstimate,
  Provenance,
  ScientificStatus,
  StatePayload,
  TensionGroup,
  TensionResult,
  Uncertainty,
  WeightedH0Estimate,
  AtlasApiClient,
  EntityRead,
  ObservatoryData,
  ResearchRecord,
  ScientificSection
} from './types';
import type { AtlasEdge, AtlasNode } from '../scene/types';
import { AtlasApiError, errorMessage } from './errors';

type RecordValue = Record<string, unknown>;

const asRecord = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
const firstText = (...values: unknown[]): string | undefined => values.map(text).find(Boolean);

const STATUS_ALIASES: Record<string, ScientificStatus> = {
  measured: 'MEASURED',
  observed: 'MEASURED',
  supported: 'SUPPORTED',
  validated: 'SUPPORTED',
  approved: 'SUPPORTED',
  provisional: 'PROVISIONAL',
  candidate: 'CANDIDATE',
  inconclusive: 'INCONCLUSIVE',
  unknown: 'UNKNOWN',
  stale: 'STALE',
  blocked: 'BLOCKED',
  contradicted: 'CONTRADICTED',
  disproved: 'CONTRADICTED',
  consistent: 'CONSISTENT',
  interesting: 'INTERESTING',
  tension: 'TENSION',
  significant: 'SIGNIFICANT'
};

export function scientificStatus(value: unknown, fallback: ScientificStatus = 'UNKNOWN'): ScientificStatus {
  const raw = text(value)?.toLowerCase();
  return raw ? STATUS_ALIASES[raw] || fallback : fallback;
}

export function uncertainty(value: unknown): Uncertainty | undefined {
  const scalar = number(value);
  if (scalar !== undefined) return scalar;
  const item = asRecord(value);
  const plus = number(item.plus ?? item.upper ?? item.high);
  const minus = number(item.minus ?? item.lower ?? item.low);
  return plus !== undefined && minus !== undefined ? { plus, minus } : undefined;
}

export function provenance(value: unknown): Provenance[] {
  return asArray(value).map(item => {
    const ref = asRecord(item);
    return {
      source: firstText(ref.source, ref.source_kind, ref.sourceSurface),
      sourceId: firstText(ref.sourceId, ref.source_id),
      sourceRef: firstText(ref.sourceRef, ref.source_ref, ref.source_location),
      url: text(ref.url),
      observedAt: firstText(ref.observedAt, ref.observed_at, ref.updatedAt),
      label: firstText(ref.label, ref.title)
    };
  }).filter(ref => Object.values(ref).some(Boolean));
}

export function freshnessState(value: unknown, fallback: Freshness = 'DEGRADED'): FreshnessState {
  const root = asRecord(value);
  const projection = asRecord(root.projection);
  const dataSource = asRecord(root.dataSource);
  const raw = firstText(root.freshness, projection.freshness, dataSource.freshness, root.source);
  const normalized = raw?.toUpperCase();
  const state: Freshness = normalized === 'LIVE' ? 'LIVE'
    : normalized === 'SNAPSHOT' ? 'SNAPSHOT'
      : normalized === 'STALE' || normalized === 'FALLBACK' ? 'STALE'
        : normalized === 'OFFLINE' ? 'OFFLINE'
          : fallback;
  return {
    state,
    source: firstText(root.source, projection.source, dataSource.effective),
    sourceVersion: firstText(root.sourceVersion, projection.sourceVersion),
    updatedAt: firstText(root.updatedAt, root.generatedAt, projection.sourceVersion, dataSource.checkedAt),
    message: firstText(root.reason, dataSource.reason)
  };
}

export function parseHealth(value: unknown): HealthPayload {
  const root = asRecord(value);
  const source = asRecord(root.dataSource);
  return {
    ok: typeof root.ok === 'boolean' ? root.ok : undefined,
    contract: text(root.contract),
    dataSource: {
      requested: text(source.requested),
      effective: text(source.effective),
      freshness: text(source.freshness),
      reason: text(source.reason)
    },
    fingerprint: text(root.fingerprint),
    sourceVersion: text(root.sourceVersion)
  };
}

export function parseEntity(value: unknown): EntityRead | null {
  const root = asRecord(value);
  const rawEntity = asRecord(root.entity);
  if (!text(rawEntity.id)) return null;
  const entity = rawEntity as AtlasNode;
  const relations = asArray(root.relations).filter(item => {
    const edge = asRecord(item);
    return Boolean(text(edge.source) && text(edge.target));
  }) as AtlasEdge[];
  return { entity, relations, relationCount: number(root.relationCount), source: text(root.source), provenance: provenance(root.provenance ?? entity.sourceRefs) };
}

export function parseState(value: unknown): StatePayload {
  const root = asRecord(value);
  const numericMap = (input: unknown): Record<string, number> => Object.fromEntries(Object.entries(asRecord(input)).flatMap(([key, item]) => {
    const parsed = number(item);
    return parsed === undefined ? [] : [[key, parsed]];
  }));
  const sources = Object.fromEntries(Object.entries(asRecord(root.sources)).map(([key, item]) => {
    const source = asRecord(item);
    return [key, { status: text(source.status), observedAt: firstText(source.observedAt, source.observed_at) }];
  }));
  return {
    counts: numericMap(root.counts),
    statuses: numericMap(root.statuses),
    domains: numericMap(root.domains),
    activity: numericMap(root.activity),
    claims: numericMap(root.claims),
    claimKinds: numericMap(root.claimKinds),
    total: number(root.total),
    sources,
    projection: asRecord(root.projection) as StatePayload['projection'],
    capabilities: asRecord(root.capabilities),
    parameters: root.parameters,
    tensions: root.tensions,
    directionalSignals: root.directionalSignals,
    observatory: root.observatory,
    snapshot: root.snapshot,
    synthesis: root.synthesis
  };
}

function nestedCollection(state: StatePayload, key: string): unknown[] {
  const observatory = asRecord(state.observatory);
  const snapshot = asRecord(state.snapshot);
  return [state[key as keyof StatePayload], observatory[key], snapshot[key], asRecord(observatory.summary)[key], asRecord(snapshot.summary)[key]]
    .flatMap(asArray);
}

function refs(item: RecordValue): Provenance[] {
  return provenance(item.provenance ?? item.provenances ?? item.sourceRefs ?? item.source_refs);
}

export function parseParameters(state: StatePayload): ParameterEstimate[] {
  const items: Array<ParameterEstimate | null> = nestedCollection(state, 'parameters').map((raw, index): ParameterEstimate | null => {
    const item = asRecord(raw);
    const value = number(item.value ?? item.estimate ?? item.mean);
    if (value === undefined) return null;
    const id = firstText(item.id, item.key, item.name) || `parameter-${index + 1}`;
    return {
      id,
      label: firstText(item.label, item.title, item.name, id) || id,
      value,
      uncertainty: uncertainty(item.uncertainty ?? item.sigma ?? item.error),
      unit: text(item.unit),
      status: scientificStatus(item.status, 'INCONCLUSIVE'),
      evidenceLevel: scientificStatus(item.evidenceLevel ?? item.evidence_level, scientificStatus(item.status, 'INCONCLUSIVE')),
      updatedAt: firstText(item.updatedAt, item.updated_at),
      provenance: refs(item)
    } satisfies ParameterEstimate;
  });
  return items.filter((item): item is ParameterEstimate => item !== null);
}

function parseMeasurements(state: StatePayload): DatasetMeasurement[] {
  const items: Array<DatasetMeasurement | null> = nestedCollection(state, 'measurements').map((raw, index): DatasetMeasurement | null => {
    const item = asRecord(raw);
    const value = number(item.value ?? item.estimate ?? item.mean);
    if (value === undefined) return null;
    return {
      id: firstText(item.id, item.datasetId, item.dataset_id) || `measurement-${index + 1}`,
      dataset: firstText(item.dataset, item.datasetLabel, item.dataset_label, item.name) || `Dataset ${index + 1}`,
      value,
      uncertainty: uncertainty(item.uncertainty ?? item.sigma ?? item.error),
      method: firstText(item.method, item.methodology),
      reference: firstText(item.reference, item.citation, item.paper),
      category: firstText(item.category, item.group),
      status: scientificStatus(item.status, 'MEASURED'),
      provenance: refs(item)
    } satisfies DatasetMeasurement;
  });
  return items.filter((item): item is DatasetMeasurement => item !== null);
}

export function parseWeightedH0(state: StatePayload): WeightedH0Estimate | null {
  const observatory = asRecord(state.observatory);
  const source = asRecord(state.weightedH0 ?? observatory.weightedH0 ?? observatory.h0);
  const value = number(source.value ?? source.estimate ?? source.mean);
  if (value === undefined) return null;
  const range = (input: unknown): [number, number] | undefined => {
    const values = asArray(input).map(number).filter((item): item is number => item !== undefined);
    return values.length >= 2 ? [values[0], values[1]] : undefined;
  };
  const measurements = parseMeasurements(state);
  return {
    value,
    uncertainty: uncertainty(source.uncertainty ?? source.sigma ?? source.error),
    unit: text(source.unit),
    datasetCount: number(source.datasetCount ?? source.dataset_count) ?? (measurements.length || undefined),
    chiSquared: number(source.chiSquared ?? source.chi_squared ?? source.chi2),
    measurements,
    interval1Sigma: range(source.interval1Sigma ?? source.interval_1sigma),
    interval2Sigma: range(source.interval2Sigma ?? source.interval_2sigma),
    updatedAt: firstText(source.updatedAt, source.updated_at, state.projection?.sourceVersion),
    provenance: refs(source)
  } satisfies WeightedH0Estimate;
}

function parseTensionGroup(raw: unknown, index: number): TensionGroup | null {
  const item = asRecord(raw);
  const estimate = number(item.estimate ?? item.value ?? item.mean);
  return {
    id: firstText(item.id, item.key) || `group-${index + 1}`,
    label: firstText(item.label, item.title, item.name) || `Grupo ${index + 1}`,
    category: firstText(item.category, item.classification, item.era),
    estimate,
    uncertainty: uncertainty(item.uncertainty ?? item.sigma ?? item.error),
    unit: text(item.unit),
    provenance: refs(item)
  } satisfies TensionGroup;
}

export function parseTensions(state: StatePayload): TensionResult[] {
  const items: Array<TensionResult | null> = nestedCollection(state, 'tensions').map((raw, index): TensionResult | null => {
    const item = asRecord(raw);
    const groups = asArray(item.groups ?? item.estimates ?? item.comparisons).map(parseTensionGroup).filter((group): group is TensionGroup => group !== null);
    if (groups.length < 2) return null;
    return {
      id: firstText(item.id, item.key) || `tension-${index + 1}`,
      label: firstText(item.label, item.title, item.name) || 'Comparação observacional',
      groups,
      difference: number(item.difference ?? item.delta),
      significance: number(item.significance ?? item.sigma),
      compatibility: firstText(item.compatibility, item.compatibilityState),
      status: scientificStatus(item.status ?? item.classification, 'INCONCLUSIVE'),
      updatedAt: firstText(item.updatedAt, item.updated_at, state.projection?.sourceVersion),
      provenance: refs(item)
    } satisfies TensionResult;
  });
  return items.filter((item): item is TensionResult => item !== null);
}

export function parseDirectionalSignals(state: StatePayload): DirectionalSignal[] {
  return nestedCollection(state, 'directionalSignals').map((raw, index) => {
    const item = asRecord(raw);
    const stateValue = scientificStatus(item.state ?? item.status, 'INCONCLUSIVE');
    return {
      id: firstText(item.id, item.key) || `direction-${index + 1}`,
      label: firstText(item.label, item.title, item.name) || 'Sinal direcional',
      state: stateValue === 'CANDIDATE' || stateValue === 'PROVISIONAL' || stateValue === 'SUPPORTED' ? stateValue : 'INCONCLUSIVE',
      ra: number(item.ra ?? item.rightAscension),
      dec: number(item.dec ?? item.declination),
      amplitude: number(item.amplitude),
      uncertainty: uncertainty(item.uncertainty ?? item.error),
      significance: number(item.significance ?? item.sigma),
      method: firstText(item.method, item.methodology),
      redshiftRange: firstText(item.redshiftRange, item.redshift_range),
      datasets: asArray(item.datasets).map(text).filter((item): item is string => Boolean(item)),
      selectionFunction: firstText(item.selectionFunction, item.selection_function),
      globalSignificance: number(item.globalSignificance ?? item.global_significance),
      provenance: refs(item)
    } satisfies DirectionalSignal;
  });
}

export function parseNarrative(state: StatePayload): string | undefined {
  const synthesis = asRecord(state.synthesis);
  const snapshot = asRecord(state.snapshot);
  const observatory = asRecord(state.observatory);
  return firstText(synthesis.narrative, synthesis.summary, state.synthesis, snapshot.narrative, observatory.narrative);
}

export function parseSections(state: StatePayload): ScientificSection[] {
  const synthesis = asRecord(state.synthesis);
  return asArray(synthesis.sections).map((raw, index) => {
    const item = asRecord(raw);
    const id = firstText(item.id, item.key) || `section-${index + 1}`;
    return {
      id,
      label: firstText(item.label, item.title, item.name, id) || id,
      summary: firstText(item.summary, item.narrative, item.conclusion),
      status: scientificStatus(item.status, 'INCONCLUSIVE'),
      updatedAt: firstText(item.updatedAt, item.updated_at),
      provenance: refs(item)
    } satisfies ScientificSection;
  });
}

export function contextQuery(context: AtlasContext): Record<string, string> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => Boolean(value))) as Record<string, string>;
}

export function adaptObservatoryState(raw: unknown): ObservatoryData {
  const state = parseState(raw);
  return {
    h0: parseWeightedH0(state),
    tensions: parseTensions(state),
    directionalSignals: parseDirectionalSignals(state),
    parameters: parseParameters(state),
    narrative: parseNarrative(state),
    sections: parseSections(state),
    freshness: freshnessState(raw)
  };
}

export function createAtlasAdapter(client: AtlasApiClient) {
  const stateCache = new Map<string, Promise<unknown>>();
  const readState = (context: AtlasContext = {}) => {
    const key = JSON.stringify(contextQuery(context));
    const cached = stateCache.get(key);
    if (cached) return cached;
    const request = client.state(contextQuery(context)).catch(error => {
      stateCache.delete(key);
      throw new AtlasApiError('STATE_READ_FAILED', errorMessage(error));
    });
    stateCache.set(key, request);
    return request;
  };
  const getObservatorySummary = async (context: AtlasContext = {}) => adaptObservatoryState(await readState(context));
  return {
    getAtlasGraph: (query: Record<string, string | number | undefined>) => client.graph(query),
    getObservatorySummary,
    getParameters: async (context: AtlasContext = {}) => (await getObservatorySummary(context)).parameters,
    getTensions: async (context: AtlasContext = {}) => (await getObservatorySummary(context)).tensions,
    getDirectionalSignals: async (context: AtlasContext = {}) => (await getObservatorySummary(context)).directionalSignals,
    getUniverseSnapshot: async (context: AtlasContext = {}) => {
      const summary = await getObservatorySummary(context);
      return { parameters: summary.parameters, narrative: summary.narrative, freshness: summary.freshness };
    },
    getClaims: async (context: AtlasContext = {}) => recordsFromGraph(await client.graph({ ...contextQuery(context), type: 'CLAIM', mode: 'search', limit: 120 })),
    getTests: async (context: AtlasContext = {}) => recordsFromGraph(await client.graph({ ...contextQuery(context), type: 'TEST', mode: 'search', limit: 120 })),
    getRuns: async (context: AtlasContext = {}) => recordsFromGraph(await client.graph({ ...contextQuery(context), type: 'RUN', mode: 'search', limit: 120 })),
    getResults: async (context: AtlasContext = {}) => recordsFromGraph(await client.graph({ ...contextQuery(context), type: 'RESULT', mode: 'search', limit: 120 })),
    getEvidence: async (context: AtlasContext = {}) => recordsFromGraph(await client.graph({ ...contextQuery(context), type: 'EVIDENCE', mode: 'search', limit: 120 })),
    getPipelines: async (context: AtlasContext = {}) => recordsFromGraph(await client.graph({ ...contextQuery(context), type: 'PIPELINE', mode: 'search', limit: 120 })),
    getEntity: async (id: string) => client.entity(id),
    getLineage: async (id: string) => client.lineage(id),
    getLearning: async () => client.learning(),
    getOps: async () => client.ops(),
    getAudit: async () => client.audit(),
    getHealth: async () => parseHealth(await client.health())
  };
}

function recordsFromGraph(graph: { nodes: AtlasNode[] }): ResearchRecord[] {
  return graph.nodes.filter(node => Boolean(node.id)).map(node => ({
    id: String(node.id),
    label: firstText(node.label, node.id) || String(node.id),
    type: firstText(node.type, 'ENTITY') || 'ENTITY',
    status: text(node.status),
    domain: text(node.domain),
    summary: text(node.summary),
    updatedAt: firstText(node.updatedAt, node.updated_at),
    provenance: provenance(node.sourceRefs ?? node.source_refs),
    node
  }));
}
