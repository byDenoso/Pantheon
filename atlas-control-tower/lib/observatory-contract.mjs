/**
 * Backend read model for the Observatório surfaces.
 *
 * This module deliberately works on the graph contract rather than on a
 * physical database schema. It can therefore be used by the Vercel function
 * and by contract tests without creating a second data owner. The graph stays
 * bounded to SYSTEM -> DOMAIN -> CAMPAIGN; tests remain counts on campaigns,
 * never nodes in the spatial map.
 */

export const OBSERVATORY_QUESTIONS_CONTRACT = 'NEXO_ATLAS_OBSERVATORY_QUESTIONS_V1';

export const OBSERVATORY_SURFACES = Object.freeze([
  { id: 'questions', label: 'Perguntas', description: 'O que cada domínio está tentando responder.', owner: 'science_v1.domains', destination: 'universe' },
  { id: 'evidence', label: 'Evidências', description: 'Fontes e resultados que sustentam ou limitam uma leitura.', owner: 'science_v1.provenance', destination: 'lab', kind: 'EVIDENCE' },
  { id: 'tests', label: 'Testes', description: 'Validações publicadas por campanha; não são nós do mapa.', owner: 'science_v1.entities', destination: 'lab', kind: 'TEST' },
  { id: 'relations', label: 'Relações', description: 'Conexões declaradas entre entidades e domínios.', owner: 'science_v1.relations', destination: 'graphs' },
  { id: 'decisions', label: 'Decisões', description: 'Claims de decisão e seus vínculos de evidência.', owner: 'science_v1.entities', destination: 'lab', kind: 'DECISION' }
]);

const statusMap = {
  CONSTRAINED: 'SUPPORTED',
  SURVIVES: 'CANDIDATE',
  SURVIVES_CLASS_ONLY: 'CANDIDATE',
  MIXED: 'TENSION',
  KILLED_PARENT: 'CONTRADICTED',
  ACTIVE: 'PROVISIONAL',
  MONITOR: 'INCONCLUSIVE',
  CHECKPOINTED: 'PROVISIONAL'
};

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function metadataOf(node) {
  return asRecord(node?.metadata);
}

function nodeType(node) {
  return text(node?.type).toUpperCase();
}

function normalizedStatus(raw) {
  const value = text(raw).toUpperCase();
  return statusMap[value] || (value === 'SUPPORTED' || value === 'PROVISIONAL' || value === 'CANDIDATE' || value === 'INCONCLUSIVE' || value === 'CONTRADICTED' || value === 'TENSION' ? value : 'UNKNOWN');
}

function codeOf(domain) {
  return text(domain?.domain || text(domain?.id).replace(/^domain:/i, '')).toUpperCase();
}

function campaignBelongsTo(domain, campaign, edges) {
  const code = codeOf(domain);
  return campaign.domain?.toUpperCase?.() === code
    || asArray(campaign.domains).map(value => text(value).toUpperCase()).includes(code)
    || edges.some(edge => edge?.source === domain.id && edge?.target === campaign.id);
}

function campaignRef(node) {
  const rawCount = number(metadataOf(node).testCount ?? metadataOf(node).test_count);
  return {
    id: text(node.id),
    label: text(node.label) || text(node.id),
    status: text(node.status),
    testCount: rawCount
  };
}

function questionRow(domain, campaigns) {
  const code = codeOf(domain);
  const rawStatus = text(domain.status);
  const question = text(domain.summary || domain.question);
  const refs = campaigns.map(campaignRef).filter(item => item.id);
  const knownCounts = refs.filter(item => item.testCount !== null);
  const testCount = knownCounts.reduce((sum, item) => sum + item.testCount, 0);
  const testsKnown = refs.length > 0 && knownCounts.length === refs.length;
  const hasQuestion = Boolean(question);

  return {
    id: text(domain.id),
    code,
    label: text(domain.label) || code,
    question,
    status: normalizedStatus(rawStatus),
    rawStatus,
    campaigns: refs,
    testCount: testsKnown ? testCount : 0,
    testCountKnown: testsKnown,
    counts: { campaigns: refs.length, tests: testsKnown ? testCount : null },
    synthesis: null,
    availability: hasQuestion ? 'QUESTION_PUBLISHED' : 'DATA_UNAVAILABLE',
    unavailableReason: hasQuestion
      ? 'A fonte publica a pergunta e o recorte de campanhas, mas ainda não publica uma síntese quantitativa para este domínio.'
      : 'A fonte ainda não publicou uma pergunta semântica para este domínio.',
    nextAction: refs.length
      ? 'Abrir as campanhas para revisar testes, evidências e relações publicadas.'
      : 'Aguardar a publicação de uma campanha vinculada a este domínio.'
  };
}

function surfaceCounts(nodes, edges, domains) {
  const isPhysicalType = (node, expected) => nodeType(node) === expected || text(metadataOf(node).entity_type).toUpperCase() === expected;
  return OBSERVATORY_SURFACES.map(surface => {
    const count = surface.id === 'questions'
      ? domains.length
      : surface.id === 'relations'
        ? edges.length
        : surface.id === 'evidence'
          ? nodes.filter(node => isPhysicalType(node, 'EVIDENCE')).length
          : surface.id === 'tests'
            ? nodes.filter(node => isPhysicalType(node, 'TEST')).length
            : nodes.filter(node => isPhysicalType(node, 'DECISION') || text(metadataOf(node).entity_type).toUpperCase() === 'DECISION_HYPOTHESIS').length;
    return { ...surface, count, available: count > 0 };
  });
}

export function observatoryQuestionsPayload(graph, { freshness = 'LIVE', source = 'science_v1', sourceVersion = '' } = {}) {
  const nodes = asArray(graph?.nodes);
  const edges = asArray(graph?.edges);
  const domains = nodes
    .filter(node => nodeType(node) === 'DOMAIN')
    .filter(node => codeOf(node))
    .sort((a, b) => codeOf(a).localeCompare(codeOf(b), undefined, { numeric: true }));
  const items = domains.map(domain => {
    const campaigns = nodes.filter(node => nodeType(node) === 'CAMPAIGN' && campaignBelongsTo(domain, node, edges));
    return questionRow(domain, campaigns);
  });
  const unavailable = items.filter(item => item.availability === 'DATA_UNAVAILABLE').map(item => item.code);
  const counts = {
    domains: items.length,
    campaigns: items.reduce((sum, item) => sum + item.counts.campaigns, 0),
    tests: items.every(item => item.testCountKnown) ? items.reduce((sum, item) => sum + item.testCount, 0) : null,
    questionsWithSynthesis: items.filter(item => item.synthesis).length,
    unavailable: unavailable.length
  };
  return {
    contract: OBSERVATORY_QUESTIONS_CONTRACT,
    status: items.length ? 'OK' : 'DATA_UNAVAILABLE',
    freshness,
    source,
    sourceVersion,
    generatedAt: new Date().toISOString(),
    authority: 'SCIENCE_SOURCE',
    projectionAuthority: 'ATLAS_READ_MODEL',
    data: { items, counts, unavailable, surfaces: surfaceCounts(nodes, edges, domains) },
    items,
    counts,
    unavailable,
    surfaces: surfaceCounts(nodes, edges, domains)
  };
}
