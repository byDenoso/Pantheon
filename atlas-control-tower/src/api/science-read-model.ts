import type { Provenance } from './types';

export const SCIENCE_READ_MODEL_V2_CONTRACT = 'NEXO_SCIENCE_READ_MODEL_V2' as const;

export type ScientificObservationKind = 'scalar' | 'interval' | 'distribution' | 'directional' | 'timeseries' | 'matrix' | 'categorical';

export type ScientificObservation = {
  id: string;
  metricId: string;
  label: string;
  kind: ScientificObservationKind;
  value?: number | string | boolean;
  unit?: string;
  uncertainty?: { low?: number; high?: number; sigma?: number; confidenceLevel?: string };
  stackId?: string;
  stackLabel?: string;
  datasets: string[];
  model?: string;
  programId?: string;
  campaignId?: string;
  testId?: string;
  domains: string[];
  status?: string;
  evidenceClass?: string;
  sourceRef?: string;
  observedAt?: string;
  provenance: Provenance[];
  ra?: number;
  dec?: number;
  points?: Array<{ x?: number | string; y?: number }>;
  matrix?: number[][];
  categories?: string[];
};

export type ScienceProgram = { id: string; type: 'PROGRAM'; label: string; status?: string; domain?: string; summary?: string };
export type ScienceCampaign = { id: string; type: 'CAMPAIGN'; label: string; programId?: string; status?: string; summary?: string; question?: string; facets: string[]; declaredTestCount?: number; observedTestCount?: number };
export type ScienceFacet = { id: string; code: string; label: string; type: 'FACET'; campaignIds: string[]; question?: string; status?: string };
export type ScienceComparison = { id: string; kind: string; metricId?: string; observationIds: string[]; value?: number; unit?: string; significance?: number; status?: string; summary?: string; provenance: Provenance[] };
export type ScienceSynthesis = { id: string; scope: string; scopeId: string; status: string; narrative?: string; observationIds: string[]; comparisonIds: string[]; evidenceIds: string[]; dependencyFingerprint: string; updatedAt: string; provenance: Provenance[] };
export type ScienceInvestigationRecord = { id: string; type: string; label: string; status?: string; primaryCampaign?: string; domains: string[]; summary?: string; keyMetrics?: string; evidenceClass?: string; updatedAt?: string; sourceRef?: string; provenance: Provenance[] };

export type ScienceReadModelV2 = {
  contract: typeof SCIENCE_READ_MODEL_V2_CONTRACT;
  state: 'READY' | 'EMPTY' | 'DATA_UNAVAILABLE' | 'PARTIAL' | 'STALE' | 'ERROR' | string;
  generatedAt?: string;
  sourceVersion?: string;
  fingerprint?: string;
  freshness: 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED' | string;
  structure: { programs: ScienceProgram[]; campaigns: ScienceCampaign[]; facets: ScienceFacet[]; edges: Array<{ id: string; source: string; target: string; type: string }> };
  observations: ScientificObservation[];
  comparisons: ScienceComparison[];
  syntheses: ScienceSynthesis[];
  investigation: {
    hypotheses: ScienceInvestigationRecord[];
    claims: ScienceInvestigationRecord[];
    tests: ScienceInvestigationRecord[];
    runs: ScienceInvestigationRecord[];
    results: ScienceInvestigationRecord[];
    evidence: ScienceInvestigationRecord[];
    decisions: ScienceInvestigationRecord[];
    knowledge: ScienceInvestigationRecord[];
    pipelines: ScienceInvestigationRecord[];
  };
  activity: unknown[];
  shards: unknown[];
  provenance: Provenance[];
};

const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const num = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
const strings = (value: unknown): string[] => arr(value).map(text).filter(Boolean);
const provenance = (value: unknown): Provenance[] => arr(value).map(item => obj(item) as Provenance).filter(item => Object.values(item).some(Boolean));

function investigationRecords(value: unknown, fallbackType: string): ScienceInvestigationRecord[] {
  return arr(value).map(raw => {
    const row = obj(raw);
    const id = text(row.id);
    if (!id) return null;
    return {
      id,
      type: text(row.type) || fallbackType,
      label: text(row.label) || id,
      status: text(row.status) || undefined,
      primaryCampaign: text(row.primaryCampaign) || undefined,
      domains: strings(row.domains),
      summary: text(row.summary) || undefined,
      keyMetrics: text(row.keyMetrics) || undefined,
      evidenceClass: text(row.evidenceClass) || undefined,
      updatedAt: text(row.updatedAt) || undefined,
      sourceRef: text(row.sourceRef) || undefined,
      provenance: provenance(row.provenance)
    } satisfies ScienceInvestigationRecord;
  }).filter((item): item is ScienceInvestigationRecord => Boolean(item));
}

export function parseScienceReadModel(raw: unknown): ScienceReadModelV2 {
  const root = obj(raw);
  const data = Object.keys(obj(root.data)).length ? obj(root.data) : root;
  if (data.contract !== SCIENCE_READ_MODEL_V2_CONTRACT) throw new Error('SCIENCE_READ_MODEL_V2_INVALID');
  const structure = obj(data.structure), investigation = obj(data.investigation);
  const programs = arr(structure.programs).map(rawProgram => {
    const row = obj(rawProgram), id = text(row.id);
    return id ? { id, type: 'PROGRAM' as const, label: text(row.label) || id, status: text(row.status) || undefined, domain: text(row.domain) || undefined, summary: text(row.summary) || undefined } : null;
  }).filter((item): item is ScienceProgram => Boolean(item));
  const campaigns = arr(structure.campaigns).map(rawCampaign => {
    const row = obj(rawCampaign), id = text(row.id);
    return id ? { id, type: 'CAMPAIGN' as const, label: text(row.label) || id, programId: text(row.programId) || undefined, status: text(row.status) || undefined, summary: text(row.summary) || undefined, question: text(row.question) || undefined, facets: strings(row.facets), declaredTestCount: num(row.declaredTestCount), observedTestCount: num(row.observedTestCount) } : null;
  }).filter((item): item is ScienceCampaign => Boolean(item));
  const facets = arr(structure.facets).map(rawFacet => {
    const row = obj(rawFacet), code = text(row.code).toUpperCase(), id = text(row.id) || (code ? `facet:${code}` : '');
    return id && code ? { id, code, label: text(row.label) || code, type: 'FACET' as const, campaignIds: strings(row.campaignIds), question: text(row.question) || undefined, status: text(row.status) || undefined } : null;
  }).filter((item): item is ScienceFacet => Boolean(item));
  const observations = arr(data.observations).map(rawObservation => {
    const row = obj(rawObservation), id = text(row.id), metricId = text(row.metricId), kind = text(row.kind) as ScientificObservationKind;
    if (!id || !metricId || !['scalar','interval','distribution','directional','timeseries','matrix','categorical'].includes(kind)) return null;
    const uncertaintyRaw = obj(row.uncertainty);
    const uncertainty = Object.keys(uncertaintyRaw).length ? { low: num(uncertaintyRaw.low), high: num(uncertaintyRaw.high), sigma: num(uncertaintyRaw.sigma), confidenceLevel: text(uncertaintyRaw.confidenceLevel) || undefined } : undefined;
    return {
      id, metricId, label: text(row.label) || metricId, kind,
      value: typeof row.value === 'number' || typeof row.value === 'string' || typeof row.value === 'boolean' ? row.value : undefined,
      unit: text(row.unit) || undefined, uncertainty, stackId: text(row.stackId) || undefined, stackLabel: text(row.stackLabel) || undefined,
      datasets: strings(row.datasets), model: text(row.model) || undefined, programId: text(row.programId) || undefined, campaignId: text(row.campaignId) || undefined,
      testId: text(row.testId) || undefined, domains: strings(row.domains), status: text(row.status) || undefined, evidenceClass: text(row.evidenceClass) || undefined,
      sourceRef: text(row.sourceRef) || undefined, observedAt: text(row.observedAt) || undefined, provenance: provenance(row.provenance),
      ra: num(row.ra), dec: num(row.dec), points: arr(row.points).map(point => obj(point)).map(point => ({ x: typeof point.x === 'number' || typeof point.x === 'string' ? point.x : undefined, y: num(point.y) })).filter(point => point.y !== undefined),
      matrix: arr(row.matrix).map(line => arr(line).map(num).filter((item): item is number => item !== undefined)), categories: strings(row.categories)
    } satisfies ScientificObservation;
  }).filter((item): item is ScientificObservation => Boolean(item));
  const comparisons = arr(data.comparisons).map(rawComparison => {
    const row = obj(rawComparison), id = text(row.id);
    return id ? { id, kind: text(row.kind), metricId: text(row.metricId) || undefined, observationIds: strings(row.observationIds), value: num(row.value), unit: text(row.unit) || undefined, significance: num(row.significance), status: text(row.status) || undefined, summary: text(row.summary) || undefined, provenance: provenance(row.provenance) } : null;
  }).filter((item): item is ScienceComparison => Boolean(item));
  const syntheses = arr(data.syntheses).map(rawSynthesis => {
    const row = obj(rawSynthesis), id = text(row.id);
    return id ? { id, scope: text(row.scope), scopeId: text(row.scopeId), status: text(row.status), narrative: text(row.narrative) || undefined, observationIds: strings(row.observationIds), comparisonIds: strings(row.comparisonIds), evidenceIds: strings(row.evidenceIds), dependencyFingerprint: text(row.dependencyFingerprint), updatedAt: text(row.updatedAt), provenance: provenance(row.provenance) } : null;
  }).filter((item): item is ScienceSynthesis => Boolean(item));
  return {
    contract: SCIENCE_READ_MODEL_V2_CONTRACT,
    state: text(data.state) || 'DATA_UNAVAILABLE', generatedAt: text(data.generatedAt) || undefined, sourceVersion: text(data.sourceVersion) || undefined,
    fingerprint: text(data.fingerprint) || undefined, freshness: text(data.freshness) || 'SNAPSHOT',
    structure: { programs, campaigns, facets, edges: arr(structure.edges).map(rawEdge => obj(rawEdge)).filter(edge => text(edge.id) && text(edge.source) && text(edge.target)).map(edge => ({ id: text(edge.id), source: text(edge.source), target: text(edge.target), type: text(edge.type) || 'RELATES_TO' })) },
    observations, comparisons, syntheses,
    investigation: {
      hypotheses: investigationRecords(investigation.hypotheses, 'HYPOTHESIS'), claims: investigationRecords(investigation.claims, 'CLAIM'), tests: investigationRecords(investigation.tests, 'TEST'), runs: investigationRecords(investigation.runs, 'RUN'), results: investigationRecords(investigation.results, 'RESULT'), evidence: investigationRecords(investigation.evidence, 'EVIDENCE'), decisions: investigationRecords(investigation.decisions, 'DECISION'), knowledge: investigationRecords(investigation.knowledge, 'KNOWLEDGE'), pipelines: investigationRecords(investigation.pipelines, 'PIPELINE')
    },
    activity: arr(data.activity), shards: arr(data.shards), provenance: provenance(data.provenance)
  };
}
