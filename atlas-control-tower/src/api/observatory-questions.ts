import type { AtlasNode } from '../scene/types';
import type { ScientificStatus } from './types';
import { scientificStatus } from './scientific-status.ts';

export const OBSERVATORY_QUESTIONS_CONTRACT = 'NEXO_ATLAS_OBSERVATORY_QUESTIONS_V1';

export type ObservatorySurface = {
  id: 'questions' | 'evidence' | 'tests' | 'relations' | 'decisions';
  label: string;
  description: string;
  owner: string;
  destination: 'universe' | 'lab' | 'graphs';
  kind?: string;
  count?: number;
  available?: boolean;
};

export const DEFAULT_OBSERVATORY_SURFACES: ObservatorySurface[] = [
  { id: 'questions', label: 'Perguntas', description: 'O que cada domínio está tentando responder.', owner: 'science_v1.domains', destination: 'universe' },
  { id: 'evidence', label: 'Evidências', description: 'Fontes e resultados que sustentam ou limitam uma leitura.', owner: 'science_v1.provenance', destination: 'lab', kind: 'EVIDENCE' },
  { id: 'tests', label: 'Testes', description: 'Validações publicadas por campanha; não são nós do mapa.', owner: 'science_v1.entities', destination: 'lab', kind: 'TEST' },
  { id: 'relations', label: 'Relações', description: 'Conexões declaradas entre entidades e domínios.', owner: 'science_v1.relations', destination: 'graphs' },
  { id: 'decisions', label: 'Decisões', description: 'Claims de decisão e seus vínculos de evidência.', owner: 'science_v1.entities', destination: 'lab', kind: 'DECISION' }
];

/**
 * The real per-domain "scientific question" read model for Observatório/Resumo do
 * Universo. Built entirely from data the static/live graph API already publishes
 * (system:SCIENCE -> DOMAIN nodes, domain:Dx -> CAMPAIGN children with a real
 * metadata.testCount) -- no invented question text, status, or evidence count.
 *
 * `synthesis` is always null today: no producer (static snapshot generator or the
 * live Vercel functions) computes a quantitative synthesis narrative for a domain
 * anywhere in this system. Rather than silently rendering a generic empty panel,
 * `unavailableReason` states that plainly so the UI can show why, not just that.
 */
export type ObservatoryCampaignRef = {
  id: string;
  label: string;
  status: string;
  testCount: number | null;
};

export type ObservatoryQuestion = {
  id: string;
  code: string;
  label: string;
  question: string;
  status: ScientificStatus;
  rawStatus: string;
  campaigns: ObservatoryCampaignRef[];
  testCount: number;
  testCountKnown?: boolean;
  counts?: { campaigns: number; tests: number | null };
  synthesis: string | null;
  unavailableReason: string | null;
  availability?: 'QUESTION_PUBLISHED' | 'DATA_UNAVAILABLE';
  nextAction?: string;
};

export type ObservatoryQuestionsRead = {
  questions: ObservatoryQuestion[];
  surfaces: ObservatorySurface[];
  contract: string;
  status: string;
  freshness?: string;
  source?: string;
  sourceVersion?: string;
};

function metadataOf(node: AtlasNode): Record<string, unknown> {
  const value = node.metadata;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function testCountOf(node: AtlasNode): number | null {
  const value = metadataOf(node).testCount;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Pure builder: a real domain node plus its real campaign children in, one
 * ObservatoryQuestion row out. Never fabricates a question, status or count that
 * wasn't already on the input nodes.
 */
export function buildObservatoryQuestion(domainNode: AtlasNode, campaignNodes: AtlasNode[]): ObservatoryQuestion {
  const code = String(domainNode.domain || domainNode.id.replace(/^domain:/i, '')).toUpperCase();
  const rawStatus = String(domainNode.status || '');
  const campaigns: ObservatoryCampaignRef[] = campaignNodes
    .filter(node => String(node.type || '').toUpperCase() === 'CAMPAIGN')
    .map(node => ({
      id: node.id,
      label: String(node.label || node.id),
      status: String(node.status || ''),
      testCount: testCountOf(node)
    }));
  const testCount = campaigns.reduce((sum, campaign) => sum + (campaign.testCount || 0), 0);
  const testCountKnown = campaigns.length > 0 && campaigns.every(campaign => campaign.testCount !== null);
  const hasQuestion = Boolean(String(domainNode.summary || '').trim());
  return {
    id: domainNode.id,
    code,
    label: String(domainNode.label || code),
    question: String(domainNode.summary || ''),
    status: scientificStatus(rawStatus),
    rawStatus,
    campaigns,
    testCount,
    testCountKnown,
    counts: { campaigns: campaigns.length, tests: testCountKnown ? testCount : null },
    synthesis: null,
    availability: hasQuestion ? 'QUESTION_PUBLISHED' : 'DATA_UNAVAILABLE',
    unavailableReason: hasQuestion
      ? 'A fonte publica a pergunta e o recorte de campanhas, mas ainda não publica uma síntese quantitativa para este domínio.'
      : 'A fonte ainda não publicou uma pergunta semântica para este domínio.',
    nextAction: campaigns.length
      ? 'Abrir as campanhas para revisar testes, evidências e relações publicadas.'
      : 'Aguardar a publicação de uma campanha vinculada a este domínio.'
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function textValue(value: unknown): string { return typeof value === 'string' && value.trim() ? value.trim() : ''; }

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
}

/**
 * Normalises the backend envelope while preserving the graph-derived fields.
 * The UI can consume the same shape from the Vercel endpoint or the static
 * snapshot fallback; it never falls back to a hand-written question catalogue.
 */
export function parseObservatoryQuestions(value: unknown): ObservatoryQuestionsRead {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const rawItems = asArray(data.items ?? root.items);
  const questions = rawItems.map(raw => {
    const item = asRecord(raw);
    const campaigns = asArray(item.campaigns).map(campaignRaw => {
      const campaign = asRecord(campaignRaw);
      return {
        id: textValue(campaign.id),
        label: textValue(campaign.label) || textValue(campaign.id),
        status: textValue(campaign.status),
        testCount: numberValue(campaign.testCount)
      } satisfies ObservatoryCampaignRef;
    }).filter(campaign => campaign.id);
    const counts = asRecord(item.counts);
    const tests = numberValue(counts.tests ?? item.testCount);
    const rawStatus = textValue(item.rawStatus || item.status);
    return {
      id: textValue(item.id),
      code: textValue(item.code).toUpperCase(),
      label: textValue(item.label) || textValue(item.code),
      question: textValue(item.question),
      status: scientificStatus(item.status),
      rawStatus,
      campaigns,
      testCount: tests ?? 0,
      testCountKnown: item.testCountKnown === true || tests !== null,
      counts: { campaigns: numberValue(counts.campaigns) ?? campaigns.length, tests },
      synthesis: textValue(item.synthesis) || null,
      unavailableReason: textValue(item.unavailableReason) || null,
      availability: item.availability === 'QUESTION_PUBLISHED' ? 'QUESTION_PUBLISHED' : 'DATA_UNAVAILABLE',
      nextAction: textValue(item.nextAction) || undefined
    } satisfies ObservatoryQuestion;
  }).filter(question => question.id && question.code);
  const rawSurfaces = asArray(data.surfaces ?? root.surfaces);
  const surfaceById = new Map(rawSurfaces.map(raw => {
    const item = asRecord(raw);
    return [textValue(item.id), item] as const;
  }));
  const surfaces = DEFAULT_OBSERVATORY_SURFACES.map(surface => {
    const raw = surfaceById.get(surface.id);
    return raw ? {
      ...surface,
      count: numberValue(raw.count) ?? undefined,
      available: raw.available === true
    } : surface;
  });
  return {
    questions: sortObservatoryQuestions(questions),
    surfaces,
    contract: textValue(root.contract) || OBSERVATORY_QUESTIONS_CONTRACT,
    status: textValue(root.status) || 'DATA_UNAVAILABLE',
    freshness: textValue(root.freshness) || undefined,
    source: textValue(root.source) || undefined,
    sourceVersion: textValue(root.sourceVersion) || undefined
  };
}

/** Canonical D1..D10(+) ordering by numeric code, not publish order. */
export function sortObservatoryQuestions(questions: ObservatoryQuestion[]): ObservatoryQuestion[] {
  return questions.slice().sort((a, b) => {
    const numA = Number(a.code.replace(/\D/g, ''));
    const numB = Number(b.code.replace(/\D/g, ''));
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
    return a.code.localeCompare(b.code);
  });
}
