import { createHash } from 'node:crypto';
import {
  ATLAS_PROJECTION_CONTRACT,
  ATLAS_PROJECTION_VERSION,
  ATLAS_SCHEMA_VERSION,
  TOWER_AUTHORITY,
  TOWER_TRUTH_OWNER,
  assertPublicEntitySafe,
  assertTowerControl,
  canonicalLabel,
  normalizeEntityKind,
  safePublicText
} from './contracts.mjs';

const REFERENCE_FIELDS = [
  ['source_nodes', 'SOURCE_NODE'],
  ['test_refs', 'TEST_REF'],
  ['evidence_refs', 'EVIDENCE_REF'],
  ['lesson_refs', 'LESSON_REF'],
  ['novelty_refs', 'NOVELTY_REF']
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

function fingerprintFor(payload) {
  return `sha256:${createHash('sha256').update(stableStringify(payload)).digest('hex')}`;
}

function relationId(source, type, target) {
  return `rel:${encodeURIComponent(source)}:${type}:${encodeURIComponent(target)}`;
}

function nodeFrom(bucket, entity) {
  return {
    id: String(entity.id),
    type: normalizeEntityKind(bucket, entity),
    label: canonicalLabel(entity),
    status: entity.status || null,
    domain: entity.domain || entity.source_domains?.[0] || null,
    parentId: entity.program_id || null,
    entityVersion: entity.entity_version ?? null,
    projectionAuthority: TOWER_AUTHORITY
  };
}

function publicEntityView(bucket, entity) {
  const base = {
    id: String(entity.id),
    projectedType: normalizeEntityKind(bucket, entity),
    label: canonicalLabel(entity),
    status: entity.status || null,
    domain: entity.domain || entity.source_domains?.[0] || null,
    priority: entity.priority || null,
    ownerRole: entity.owner_role || entity.writer_role || null,
    parentId: entity.program_id || null,
    entityVersion: entity.entity_version ?? null
  };
  if (bucket === 'program') base.campaignCount = Number.isFinite(Number(entity.campaign_count)) ? Number(entity.campaign_count) : null;
  if (bucket === 'campaign') base.testCount = Number.isFinite(Number(entity.test_count)) ? Number(entity.test_count) : null;
  if (bucket === 'interdomain' || String(entity.kind || '').toUpperCase() === 'INTERDOMAIN') {
    return {
      ...base,
      relationType: entity.relation_type || 'INTERDOMAIN',
      sourceDomains: entity.source_domains || [],
      targetDomains: entity.target_domains || [],
      sourceNodes: entity.source_nodes || [],
      testRefs: entity.test_refs || [],
      evidenceRefs: entity.evidence_refs || [],
      mapping: safePublicText(entity.mapping),
      predictionOrUtility: safePublicText(entity.prediction_or_utility),
      falsifier: safePublicText(entity.falsifier_or_validation || entity.proposed_test?.falsifier)
    };
  }
  return base;
}

function externalStub(id) {
  return {
    id,
    type: 'REFERENCE',
    label: id,
    status: null,
    domain: null,
    parentId: null,
    entityVersion: null,
    projectionAuthority: TOWER_AUTHORITY,
    referenceOnly: true
  };
}

function shouldMaterializeReference(ref) {
  return typeof ref === 'string' && (ref.includes('::') || /^[A-Z][A-Z0-9_-]*:/.test(ref));
}

export function buildAtlasProjectionV3(input) {
  const control = assertTowerControl(input?.control);
  const sourceVersion = String(input?.sourceVersion || control.schema_version || 'unknown');
  const generatedAt = String(input?.generatedAt || new Date().toISOString());
  const completeness = String(input?.completeness || 'PARTIAL').toUpperCase();
  const entitiesByBucket = input?.entities || {};
  const publicProjection = input?.publicProjection !== false;

  const canonicalEntities = [];
  for (const bucket of Object.keys(entitiesByBucket).sort()) {
    const values = Array.isArray(entitiesByBucket[bucket]) ? entitiesByBucket[bucket] : [];
    for (const entity of values) {
      if (!entity?.id) continue;
      if (publicProjection && !assertPublicEntitySafe(entity)) continue;
      canonicalEntities.push({ bucket, entity });
    }
  }

  const nodeMap = new Map();
  const entityMap = new Map();
  for (const { bucket, entity } of canonicalEntities) {
    nodeMap.set(String(entity.id), nodeFrom(bucket, entity));
    entityMap.set(String(entity.id), publicProjection ? publicEntityView(bucket, entity) : { ...entity, projectedType: normalizeEntityKind(bucket, entity) });
  }

  const edges = [];
  const addEdge = (source, target, type) => {
    if (!source || !target || source === target) return;
    if (!nodeMap.has(source)) return;
    if (!nodeMap.has(target) && shouldMaterializeReference(target)) nodeMap.set(target, externalStub(target));
    if (!nodeMap.has(target)) return;
    edges.push({ id: relationId(source, type, target), source, target, type });
  };

  for (const { bucket, entity } of canonicalEntities) {
    const source = String(entity.id);
    if (bucket === 'campaign' && entity.program_id) addEdge(String(entity.program_id), source, 'CONTAINS');
    if (bucket === 'interdomain' || String(entity.kind || '').toUpperCase() === 'INTERDOMAIN') {
      for (const ref of entity.source_nodes || []) addEdge(source, String(ref), entity.relation_type || 'METHOD_TRANSFER');
      for (const ref of entity.test_refs || []) addEdge(source, String(ref), 'PROPOSES_TEST');
      for (const ref of entity.evidence_refs || []) addEdge(source, String(ref), 'SUPPORTED_BY');
    } else {
      for (const [field, type] of REFERENCE_FIELDS) {
        for (const ref of entity[field] || []) addEdge(source, String(ref), type);
      }
    }
  }

  edges.sort((a, b) => a.id.localeCompare(b.id));
  const nodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const entities = Object.fromEntries([...entityMap.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const filaments = canonicalEntities
    .filter(({ bucket, entity }) => bucket === 'interdomain' || String(entity.kind || '').toUpperCase() === 'INTERDOMAIN')
    .map(({ entity }) => ({
      id: String(entity.id),
      status: entity.status || 'UNKNOWN',
      relationType: entity.relation_type || 'INTERDOMAIN',
      sourceDomains: entity.source_domains || [],
      targetDomains: entity.target_domains || [],
      sourceNodes: entity.source_nodes || [],
      testRefs: entity.test_refs || [],
      evidenceRefs: entity.evidence_refs || [],
      mapping: publicProjection ? safePublicText(entity.mapping) : entity.mapping || null,
      predictionOrUtility: publicProjection ? safePublicText(entity.prediction_or_utility) : entity.prediction_or_utility || null,
      falsifier: publicProjection ? safePublicText(entity.falsifier_or_validation || entity.proposed_test?.falsifier) : entity.falsifier_or_validation || entity.proposed_test?.falsifier || null,
      proposedTest: publicProjection ? null : entity.proposed_test || null,
      entityVersion: entity.entity_version ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const works = canonicalEntities
    .filter(({ bucket }) => bucket === 'work')
    .map(({ entity }) => ({
      id: String(entity.id),
      status: entity.status || 'UNKNOWN',
      ownerRole: entity.owner_role || entity.writer_role || null,
      nextAction: publicProjection ? null : entity.next_action || null,
      entityVersion: entity.entity_version ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const fingerprintPayload = {
    contract: ATLAS_PROJECTION_CONTRACT,
    sourceVersion,
    completeness,
    nodes,
    edges,
    entities,
    filaments,
    works
  };
  const fingerprint = fingerprintFor(fingerprintPayload);

  const manifest = {
    contractVersion: ATLAS_PROJECTION_CONTRACT,
    schemaVersion: ATLAS_SCHEMA_VERSION,
    projectionVersion: ATLAS_PROJECTION_VERSION,
    fingerprint,
    sourceVersion,
    generatedAt,
    authority: TOWER_AUTHORITY,
    truthOwner: TOWER_TRUTH_OWNER,
    projectionOnly: true,
    completeness,
    freshness: 'SNAPSHOT',
    publicProjection
  };

  return {
    manifest,
    universe: {
      counts: {
        canonicalEntities: canonicalEntities.length,
        nodes: nodes.length,
        edges: edges.length,
        filaments: filaments.length,
        works: works.length
      }
    },
    graph: { root: { nodes, edges } },
    entities,
    learning: { filaments },
    operations: { works },
    health: {
      state: 'SNAPSHOT',
      authority: TOWER_AUTHORITY,
      fingerprint,
      sourceVersion,
      completeness,
      lastProjectionAt: generatedAt
    },
    provenance: {
      authority: TOWER_TRUTH_OWNER,
      source: 'TOWER_V06',
      sourceVersion,
      projectionContract: ATLAS_PROJECTION_CONTRACT
    }
  };
}
