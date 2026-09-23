import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildScienceProjectionV1, validateScienceProjectionV1 } from './science-projection-v1.mjs';

const CONTRACT = 'NEXO_PUBLIC_PROJECTION_V1';
const SYSTEM_CONTRACT = '1';
const WORLD_CONTRACT = '1';
const CORE_DOMAINS = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
const stable = value => JSON.stringify(canonical(value));
const sha256 = value => 'sha256:' + createHash('sha256').update(stable(value)).digest('hex');

function fail(message) {
  const error = new Error(message);
  error.code = 'INVALID_SANCTIONED_PROJECTION';
  throw error;
}

export function validateSanctionedProjection(projection, manifestFile = null) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) fail('projection must be an object');
  if (projection.contract !== CONTRACT) fail('projection contract must be ' + CONTRACT);
  const manifest = projection.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('projection manifest missing');
  if (manifest.authority !== 'TOWER_V06') fail('authority must be TOWER_V06');
  if (manifest.projection_only !== true) fail('projection_only must be true');
  if (manifest.writeback !== 'FORBIDDEN') fail('writeback must be FORBIDDEN');
  if (!/^[0-9a-f]{40}$/i.test(String(manifest.tower_commit || ''))) fail('tower_commit must be a full commit SHA');
  if (!String(manifest.event_cursor || '').trim()) fail('event_cursor missing');
  if (!/^sha256:[0-9a-f]{64}$/i.test(String(manifest.projection_fingerprint || ''))) fail('projection_fingerprint invalid');
  if (projection.event_cursor !== manifest.event_cursor) fail('projection event_cursor differs from manifest');
  if (!Array.isArray(projection.work) || !Array.isArray(projection.tests)) fail('work/tests arrays missing');
  if (projection.campaigns !== undefined && !Array.isArray(projection.campaigns)) fail('campaigns must be an array when present');
  if (projection.human_gates && (!Array.isArray(projection.human_gates.work_ids) || !Number.isInteger(projection.human_gates.count))) fail('human_gates invalid');
  if (!projection.capabilities || typeof projection.capabilities !== 'object' || Array.isArray(projection.capabilities)) {
    fail('capabilities map missing');
  }
  if (manifestFile && stable(manifestFile) !== stable(manifest)) fail('manifest file differs from projection.manifest');
  return manifest;
}

function cursorTime(cursor) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{6})Z/.exec(String(cursor || ''));
  if (!match) return '1970-01-01T00:00:00.000Z';
  const value = match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + '.' + match[7] + 'Z';
  return Number.isFinite(Date.parse(value)) ? value : '1970-01-01T00:00:00.000Z';
}

function domainOf(value) {
  const domain = String(value || '').trim().toUpperCase();
  if (!domain) return 'NEXO';
  if (domain === 'COSMOLOGY' || domain === 'COSMOLOGIA' || domain === 'SCIENCE') return 'SCIENCE';
  if (domain === 'ENGINEERING') return 'ENGINEERING';
  if (domain === 'OLYMPUS' || domain === 'BODYBUILDING' || domain === 'PHYSIQUE') return 'OLYMPUS';
  if (domain === 'NEXO') return 'NEXO';
  return domain.replace(/\s+/g, '_');
}

function projectionDomains(projection) {
  const domains = new Set(CORE_DOMAINS);
  for (const item of [...(projection?.work || []), ...(projection?.tests || [])]) {
    domains.add(domainOf(item?.domain));
  }
  for (const definition of Object.values(projection?.capabilities || {})) {
    if (definition?.domain) domains.add(domainOf(definition.domain));
  }
  return [...domains];
}

function capabilityStatusFromProjection(value) {
  const status = String(value || '').trim().toUpperCase();
  if (/RETIRED|REMOVED|DISABLED/.test(status)) return 'RETIRED_RUNTIME';
  if (/BLOCK|UNAVAILABLE|MISSING|FAILED|ERROR/.test(status)) return 'BLOCKED';
  if (/PROVEN|VALIDATED_CURRENT|VERIFIED|PASS|SUCCEEDED|COMPLETE/.test(status)) return 'PASS';
  if (/ACTIVE|DECLARED|READY|AVAILABLE/.test(status)) return 'UNVERIFIED';
  return 'UNKNOWN';
}

function capabilityRuntimeFromProjection(capabilityId, definition = {}) {
  const backend = String(definition?.backend || '').trim().toLowerCase();
  const id = String(capabilityId || '').trim().toLowerCase();
  if (/github[_ .-]?actions/.test(backend) || id.startsWith('github.actions.')) return 'GITHUB_ACTIONS';
  if (backend.includes('vercel')) return 'VERCEL';
  if (backend.includes('human')) return 'HUMAN';
  if (backend.includes('local')) return 'LOCAL';
  return 'NEXO_KERNEL';
}

function capabilitiesFromProjection(projection, source) {
  return Object.entries(projection?.capabilities || {}).map(([capabilityId, rawDefinition]) => {
    const definition = rawDefinition && typeof rawDefinition === 'object' ? rawDefinition : {};
    const canonicalStatus = String(definition.status || '').trim().toUpperCase();
    const backend = String(definition.backend || '').trim();
    const status = capabilityStatusFromProjection(canonicalStatus);
    const proofNote = status === 'PASS'
      ? 'PASS derives only from the explicit canonical proof state published by TOWER_V06; no execution timestamp or lower-level receipt was published in this projection.'
      : status === 'UNVERIFIED'
        ? 'The capability is declared active, but this public projection publishes no execution/readback proof.'
        : status === 'RETIRED_RUNTIME'
          ? 'The canonical projection explicitly marks this capability as retired.'
          : status === 'BLOCKED'
            ? 'The canonical projection explicitly marks this capability unavailable or blocked.'
            : 'The canonical state is not sufficient to classify execution proof.';

    return {
      capability_id: capabilityId,
      label: capabilityId,
      // The sanctioned public capability map currently publishes no domain field.
      // Keep registry-level capabilities under NEXO instead of inventing a domain.
      domain: definition.domain ? domainOf(definition.domain) : 'NEXO',
      runtime: capabilityRuntimeFromProjection(capabilityId, definition),
      // Operation and risk are intentionally null when the projection does not publish them.
      operation: null,
      status,
      risk: null,
      provider: backend || 'UNSPECIFIED',
      last_verified_at: null,
      evidence_ref: status === 'PASS' ? source : null,
      explanation: 'canonical status=' + (canonicalStatus || 'UNSPECIFIED')
        + '; backend=' + (backend || 'UNSPECIFIED') + '. ' + proofNote,
    };
  });
}

function domainsOf(value) {
  if (Array.isArray(value)) return value.map(domainOf);
  return String(value || '').split(/[|,;]/).map(item => item.trim()).filter(Boolean).map(domainOf);
}

function projectionState(value) {
  const state = String(value || '').trim().toUpperCase();
  return /BLOCK|WAIT_DEPENDENCY|FAIL|ERROR|REJECT/.test(state) ? 'BLOCKED' : 'SNAPSHOT';
}

function sourceUrl(manifest) {
  return 'https://github.com/' + String(manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault') + '/commit/' + manifest.tower_commit;
}

function sourceRef(manifest) {
  return 'tower://' + String(manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault') + '@' + manifest.tower_commit + '/TOWER_V06/projections/public/projection.json';
}

function nodeFingerprint(kind, id, manifest) {
  return sha256({ kind, id, projection_fingerprint: manifest.projection_fingerprint });
}

const LEARNING_REF_TOKEN = /\b(?:T-[A-Za-z0-9_+≈.\-]+|GZSB-[A-Za-z0-9_.\-]+|WORK::[A-Za-z0-9_:._+\-]+|CAMP-[A-Za-z0-9_.\-]+)\b/g;

function explicitLearningRefs(value) {
  return [...new Set(String(value ?? '').match(LEARNING_REF_TOKEN) || [])];
}

function learningTargetsForRef(ref, projection) {
  const work = Array.isArray(projection.work) ? projection.work : [];
  const tests = Array.isArray(projection.tests) ? projection.tests : [];
  const targets = [];
  const add = (id, domain, label) => targets.push({ id, domain: domainOf(domain), label: String(label || id) });

  for (const item of work) {
    const rawId = String(item.id || '');
    if (rawId === ref || rawId === 'WORK::' + ref) add('work:' + rawId, item.domain, item.title || rawId);
  }
  for (const item of tests) {
    const rawId = String(item.id || '');
    if (rawId === ref) add('test:' + rawId, item.domain || 'SCIENCE', item.title || rawId);
  }
  if (ref.startsWith('CAMP-')) {
    const members = [...work, ...tests].filter(item => String(item.campaign_id || '') === ref);
    const domains = [...new Set(members.map(item => domainOf(item.domain || 'SCIENCE')))];
    for (const domain of domains) add('domain:' + domain, domain, ref);
  }
  return targets;
}

function proceduralLearningFilaments(metaLearning, projection, manifest, observedAt) {
  if (!metaLearning || typeof metaLearning !== 'object') return [];
  if (String(metaLearning.authority_boundary || '') !== 'PROCEDURAL_ONLY_NO_SCIENTIFIC_AUTHORITY') return [];
  const evidence = Array.isArray(metaLearning.evidence) ? metaLearning.evidence : [];
  const lessons = Array.isArray(metaLearning.lessons) ? metaLearning.lessons : [];
  const evidenceById = new Map();
  const out = [];

  for (const item of evidence) {
    const id = String(item.evidence_id || item.id || '').trim();
    if (!id) continue;
    const refText = [item.context, item.strategy_used, item.outcome, item.recovery, item.redundancy_avoided].filter(Boolean).join(' ');
    const links = explicitLearningRefs(refText).flatMap(ref => learningTargetsForRef(ref, projection));
    const deduped = [...new Map(links.map(link => [link.id, link])).values()];
    const domains = [...new Set(deduped.map(link => link.domain))];
    const target = deduped[0] || null;
    const fromDomain = 'NEXO';
    const toDomain = target?.domain || 'NEXO';
    const record = {
      id,
      label: String(item.outcome || item.context || id),
      domain: 'NEXO',
      kind: 'PROCEDURAL',
      weight: 0.72,
      support: Number.isFinite(Number(item.supporting_count)) ? Number(item.supporting_count) : 1,
      contradiction: Number.isFinite(Number(item.contradicting_count)) ? Number(item.contradicting_count) : 0,
      status: 'PROVISIONAL',
      evidence: deduped.map(link => link.id),
      source_ref: `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/TOWER_V06/runtime/artifacts/meta_learning/METALEARNING_CURRENT.json`,
      boundary: 'Procedural learning only. It cannot promote or reinterpret a scientific claim.',
      from_label: id,
      to_label: target?.label || toDomain,
      from_domain: fromDomain,
      to_domain: toDomain,
      to_id: target?.id,
      scope: toDomain !== fromDomain ? 'INTER_DOMAIN' : 'INTRA_DOMAIN',
      observed_at: observedAt,
      links: deduped,
      learning_refs: [],
    };
    evidenceById.set(id, record);
    out.push(record);
  }

  for (const item of lessons) {
    const id = String(item.lesson_id || item.id || '').trim();
    if (!id) continue;
    const refs = Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String) : [];
    const parentRecords = refs.map(ref => evidenceById.get(ref)).filter(Boolean);
    const links = [...new Map(parentRecords.flatMap(record => record.links || []).map(link => [link.id, link])).values()];
    const domains = [...new Set(links.map(link => link.domain))];
    const target = links[0] || null;
    const fromDomain = 'NEXO';
    const toDomain = target?.domain || 'NEXO';
    const status = String(item.status || '').toUpperCase();
    out.push({
      id,
      label: String(item.lesson || item.heuristic || id),
      domain: 'NEXO',
      kind: 'PROCEDURAL',
      weight: status === 'SUPPORTED' ? 0.9 : 0.68,
      support: Number.isFinite(Number(item.supporting_count)) ? Number(item.supporting_count) : refs.length,
      contradiction: Number.isFinite(Number(item.contradicting_count)) ? Number(item.contradicting_count) : 0,
      status: status === 'SUPPORTED' ? 'ESTABLISHED' : status === 'REJECTED' ? 'CONTESTED' : 'PROVISIONAL',
      evidence: refs,
      source_ref: `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/TOWER_V06/runtime/artifacts/meta_learning/METALEARNING_CURRENT.json`,
      boundary: String(item.falsifier || 'Procedural learning only. No scientific authority.'),
      from_label: 'NEXO Learning',
      to_label: target?.label || toDomain,
      from_domain: fromDomain,
      to_domain: toDomain,
      to_id: target?.id,
      scope: toDomain !== fromDomain ? 'INTER_DOMAIN' : 'INTRA_DOMAIN',
      observed_at: observedAt,
      links,
      learning_refs: refs,
    });
  }
  return out;
}

function peerDetectionPresentationMembership(peerBattery, projection = {}) {
  const workIds = new Set();
  const testIds = new Set();
  const capabilityIds = new Set();
  const gates = peerBattery && typeof peerBattery === 'object' && peerBattery.id === 'PEER_DETECTION_BATTERY_V1'
    && peerBattery.gates && typeof peerBattery.gates === 'object'
    ? peerBattery.gates
    : {};

  for (const [gateId, gate] of Object.entries(gates)) {
    workIds.add('PEER-DETECTION-' + gateId);
    testIds.add('PEER-DETECTION-' + gateId + '-V1');
    const capabilityId = String(gate?.capability_id || '').trim();
    if (capabilityId) capabilityIds.add(capabilityId);
  }

  for (const [capabilityId, definition] of Object.entries(projection.capabilities || {})) {
    const batteryId = String(definition?.battery_id || '').trim();
    const contractName = String(definition?.contract_name || '').trim();
    if (batteryId === 'PEER_DETECTION_BATTERY_V1' || contractName === 'peer-detection-battery-v1.json') {
      capabilityIds.add(capabilityId);
    }
  }

  return { workIds, testIds, capabilityIds };
}

function peerDetectionLearningFilaments(peerBattery, projection, manifest, observedAt) {
  if (!peerBattery || typeof peerBattery !== 'object' || peerBattery.id !== 'PEER_DETECTION_BATTERY_V1') return [];
  if (!peerBattery.gates || typeof peerBattery.gates !== 'object') return [];

  const order = Array.isArray(peerBattery.execution_order)
    ? peerBattery.execution_order.map(String)
    : Object.keys(peerBattery.gates);
  const rank = new Map(order.map((gateId, index) => [gateId, index]));
  const groups = new Map();

  for (const [gateId, rawGate] of Object.entries(peerBattery.gates)) {
    const gate = rawGate && typeof rawGate === 'object' ? rawGate : {};
    const group = String(gate.group || 'UNCLASSIFIED').toUpperCase();
    const list = groups.get(group) || [];
    list.push({
      gateId,
      purpose: String(gate.purpose || gateId),
      capabilityId: String(gate.capability_id || ''),
      taskId: String(gate.task_id || ''),
      rank: rank.get(gateId) ?? Number.MAX_SAFE_INTEGER,
    });
    groups.set(group, list);
  }

  const workById = new Map((projection.work || []).map(item => [String(item.id || ''), item]));
  const groupOrder = [...groups.entries()]
    .map(([group, gates]) => ({ group, gates: gates.sort((a, b) => a.rank - b.rank) }))
    .sort((a, b) => Math.min(...a.gates.map(g => g.rank)) - Math.min(...b.gates.map(g => g.rank)));

  return groupOrder.map(({ group, gates }, groupIndex) => {
    const works = gates
      .map(gate => workById.get('PEER-DETECTION-' + gate.gateId))
      .filter(Boolean);
    const finished = works.filter(item =>
      /VERIFIED|PASS|COMPLETE|DONE|SUCCEEDED|CLOSED/.test(String(item.last_outcome || item.status || '').toUpperCase())
    ).length;
    const active = works.filter(item =>
      /READY|RUNNING|ACTIVE|PENDING|WAIT/.test(String(item.status || '').toUpperCase())
    ).length;
    const groupLabel = group
      .toLowerCase()
      .split('_')
      .map(token => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');

    return {
      id: 'PEER-DETECTION-GROUP-' + group,
      label: 'Peer Detection · ' + groupLabel,
      domain: 'SCIENCE',
      kind: 'SCIENTIFIC_LEARNING_PIPELINE',
      weight: Math.min(1, 0.66 + Math.min(0.22, gates.length * 0.035) + Math.min(0.08, finished * 0.02)),
      support: gates.length,
      contradiction: 0,
      status: finished === gates.length && gates.length > 0 ? 'ESTABLISHED'
        : active > 0 ? 'TESTING' : 'PROVISIONAL',
      evidence: gates.flatMap(gate => [
        'work:PEER-DETECTION-' + gate.gateId,
        ...(gate.capabilityId ? ['capability:' + gate.capabilityId] : []),
      ]),
      source_ref: `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/TOWER_V06/contracts/PEER_DETECTION_BATTERY_V1.json`,
      boundary: 'Scientific test architecture, not a scientific verdict. Gates: '
        + gates.map(gate => gate.gateId + ' ' + gate.purpose).join(' · '),
      from_label: 'NEXO execution · ' + groupLabel,
      to_label: 'Science · PEER inference',
      from_domain: 'NEXO',
      to_domain: 'SCIENCE',
      scope: 'INTER_DOMAIN',
      observed_at: observedAt,
      links: [],
      learning_refs: [],
      peer_detection_group: group,
      peer_detection_gate_ids: gates.map(gate => gate.gateId),
      peer_detection_gate_count: gates.length,
      peer_detection_group_index: groupIndex,
    };
  });
}

function learningFilamentsFromTower(interdomain, manifest, observedAt) {
  return (Array.isArray(interdomain) ? interdomain : []).map(item => {
    const sourceDomains = domainsOf(item.source_domains || item.sourceDomains || item.domain);
    const targetDomains = domainsOf(item.target_domains || item.targetDomains || item.domain);
    const fromDomain = sourceDomains[0] || 'NEXO';
    const toDomain = targetDomains[0] || fromDomain;
    const status = String(item.status || '').toUpperCase();
    return {
      id: String(item.id || `interdomain:${fromDomain}:${toDomain}:${item.relation_type || 'learning'}`),
      label: String(item.relation_type || item.title || item.id || 'TOWER interdomain learning'),
      domain: fromDomain,
      kind: 'SEMANTIC',
      weight: Number.isFinite(Number(item.confidence)) ? Math.max(0.1, Math.min(1, Number(item.confidence))) : 0.72,
      support: Number.isFinite(Number(item.support)) ? Number(item.support) : 1,
      contradiction: Number.isFinite(Number(item.contradict)) ? Number(item.contradict) : 0,
      status: status.includes('RETIR') ? 'RETIRED' : status.includes('CONTEST') ? 'CONTESTED'
        : status === 'ACTIVE' || status === 'SUPPORTED' || status === 'ADMIT' ? 'ESTABLISHED' : 'PROVISIONAL',
      evidence: [`tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/${String(item.id || 'interdomain')}`],
      source_ref: `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/TOWER_V06/entities/interdomain`,
      boundary: String(item.falsifier_or_validation || item.mapping || item.summary || 'Limite declarado no registro interdomínio.'),
      from_label: String(item.source_nodes?.[0] || fromDomain),
      to_label: String(item.target_domains?.[0] || toDomain),
      from_domain: fromDomain,
      to_domain: toDomain,
      scope: fromDomain === toDomain ? 'INTRA_DOMAIN' : 'INTER_DOMAIN',
      observed_at: observedAt,
    };
  });
}

function projectedWorkNode(item, manifest, observedAt, humanWorkIds) {
  const rawId = String(item?.id || '');
  if (!rawId) return null;
  const domain = domainOf(item.domain);
  return {
    id: 'work:' + rawId,
    type: 'ACTION',
    label: String(item.title || rawId),
    domain,
    state: projectionState(item.status || item.operational_status),
    authority_class: 'NON_AUTHORITATIVE',
    source_ref: sourceRef(manifest),
    source_revision: manifest.tower_commit,
    fingerprint: nodeFingerprint('work', rawId, manifest),
    freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
    checked_at: observedAt,
    summary: 'WORK projected without reinterpretation; canonical status=' + String(item.status || item.operational_status || 'UNSPECIFIED'),
    campaign_id: item.campaign_id ? String(item.campaign_id) : undefined,
    test_group_id: item.test_group_id ? String(item.test_group_id) : undefined,
    operational_status: String(item.operational_status || item.status || 'UNSPECIFIED').toUpperCase(),
    priority: item.priority ? String(item.priority).toUpperCase() : undefined,
    dependency_class: item.dependency_class ? String(item.dependency_class).toUpperCase() : undefined,
    owner_role: item.owner_role ? String(item.owner_role).toUpperCase() : undefined,
    human_gate: humanWorkIds.has(rawId),
  };
}

function campaignRecordsFromProjection(projection) {
  const explicit = Array.isArray(projection.campaigns) ? projection.campaigns : [];
  const byId = new Map();

  for (const raw of explicit) {
    if (!raw || typeof raw !== 'object') continue;
    const campaignId = String(raw.campaign_id || raw.id || '').trim();
    if (!campaignId) continue;
    byId.set(campaignId, { ...raw, campaign_id: campaignId, derived_fallback: false });
  }

  // Backward-compatible bridge for projections produced before campaigns[] existed.
  // This is intentionally weaker than canonical campaign metadata, but it means the
  // current Atlas can group already-materialized TEST/WORK immediately.
  const members = [...(projection.work || []), ...(projection.tests || [])];
  for (const item of members) {
    const campaignId = String(item?.campaign_id || '').trim();
    if (!campaignId || byId.has(campaignId)) continue;
    byId.set(campaignId, {
      campaign_id: campaignId,
      title: campaignId,
      domain: item?.domain || 'SCIENCE',
      state: 'ACTIVE',
      semantic_description: 'Campaign inferred from canonical member campaign_id; richer metadata awaits campaign projection.',
      atlas_projection: {
        visible: true,
        label: campaignId,
        show_tests: false,
      },
      source_links: [],
      derived_fallback: true,
    });
  }

  return [...byId.values()].sort((left, right) =>
    String(left.campaign_id).localeCompare(String(right.campaign_id))
  );
}

function graphFromProjection(projection, observedAt, filaments = [], peerDetectionBattery = null) {
  const manifest = projection.manifest;
  const source = sourceRef(manifest);
  const humanWorkIds = new Set(Array.isArray(projection.human_gates?.work_ids)
    ? projection.human_gates.work_ids.map(value => String(value || ''))
    : []);
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const peerMembership = peerDetectionPresentationMembership(peerDetectionBattery, projection);
  const campaigns = campaignRecordsFromProjection(projection);
  const campaignById = new Map(campaigns.map(item => [String(item.campaign_id), item]));
  const campaignMemberCounts = new Map();
  for (const item of [...(projection.work || []), ...(projection.tests || [])]) {
    const campaignId = String(item?.campaign_id || '').trim();
    if (!campaignId) continue;
    campaignMemberCounts.set(campaignId, (campaignMemberCounts.get(campaignId) || 0) + 1);
  }

  const addNode = node => {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  };
  const addEdge = (from, to) => {
    edges.push({
      id: 'edge:' + sha256({ from, to }).slice(7, 23),
      from,
      to,
      kind: 'OWNS',
      weight: 1,
      explanation: 'Presentation-only relation derived from the sanctioned Tower projection.',
    });
  };

  for (const domain of projectionDomains(projection)) {
    addNode({
      id: 'domain:' + domain,
      type: 'DOMAIN',
      label: domain,
      domain,
      state: 'SNAPSHOT',
      authority_class: 'NON_AUTHORITATIVE',
      source_ref: source,
      source_revision: manifest.tower_commit,
      fingerprint: nodeFingerprint('domain', domain, manifest),
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      checked_at: observedAt,
      summary: 'Domain rendered from the sanctioned TOWER_V06 public projection.',
    });
  }

  for (const campaign of campaigns) {
    const campaignId = String(campaign.campaign_id || '');
    if (!campaignId) continue;
    const domain = domainOf(campaign.domain || 'SCIENCE');
    const atlas = campaign.atlas_projection && typeof campaign.atlas_projection === 'object'
      ? campaign.atlas_projection
      : {};
    const id = 'campaign:' + campaignId;
    addNode({
      id,
      type: 'CAMPAIGN',
      label: String(atlas.label || campaign.title || campaignId),
      domain,
      state: projectionState(campaign.state || 'ACTIVE'),
      authority_class: campaign.derived_fallback ? 'DERIVED' : 'NON_AUTHORITATIVE',
      source_ref: source,
      source_revision: manifest.tower_commit,
      fingerprint: nodeFingerprint('campaign', campaignId, manifest),
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      checked_at: observedAt,
      summary: String(campaign.semantic_description || campaign.question || campaign.title || campaignId),
      campaign_id: campaignId,
      member_count: campaignMemberCounts.get(campaignId) || 0,
      semantic_description: campaign.semantic_description ? String(campaign.semantic_description) : undefined,
      semantic_state: campaign.semantic_state ? String(campaign.semantic_state) : undefined,
      parent_subdomain: atlas.parent_subdomain
        ? String(atlas.parent_subdomain)
        : campaign.subdomain
          ? String(campaign.subdomain).split('/').filter(Boolean).at(-1)
          : undefined,
      atlas_visible: atlas.visible !== false,
      source_links: Array.isArray(campaign.source_links)
        ? campaign.source_links
            .filter(link => link && typeof link === 'object' && /^https?:\/\//.test(String(link.url || '')))
            .map(link => ({
              label: String(link.label || link.url),
              url: String(link.url),
              kind: link.kind ? String(link.kind) : undefined,
            }))
        : [],
    });
    addEdge('domain:' + domain, id);
  }

  for (const item of projection.work) {
    const rawId = String(item.id || '');
    if (!rawId || peerMembership.workIds.has(rawId)) continue;
    const node = projectedWorkNode(item, manifest, observedAt, humanWorkIds);
    if (!node) continue;
    addNode(node);
    const campaignId = String(item.campaign_id || '').trim();
    const campaignNodeId = campaignId && campaignById.has(campaignId) ? 'campaign:' + campaignId : null;
    addEdge(campaignNodeId || ('domain:' + node.domain), node.id);
  }

  for (const item of projection.tests) {
    const rawId = String(item.id || '');
    if (!rawId || peerMembership.testIds.has(rawId)) continue;
    const domain = domainOf(item.domain || 'SCIENCE');
    const id = 'test:' + rawId;
    addNode({
      id,
      type: 'TEST',
      label: String(item.title || rawId),
      domain,
      state: projectionState(item.status),
      authority_class: 'NON_AUTHORITATIVE',
      source_ref: source,
      source_revision: manifest.tower_commit,
      fingerprint: String(item.scientific_fingerprint || nodeFingerprint('test', rawId, manifest)),
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      checked_at: observedAt,
      summary: 'TEST projected without reinterpretation; canonical status=' + String(item.status || 'UNSPECIFIED'),
      campaign_id: item.campaign_id ? String(item.campaign_id) : undefined,
      test_group_id: item.test_group_id ? String(item.test_group_id) : undefined,
      atlas_visible: item.campaign_id
        ? (campaignById.get(String(item.campaign_id))?.atlas_projection?.show_tests === true)
        : true,
    });
    const campaignId = String(item.campaign_id || '').trim();
    const campaignNodeId = campaignId && campaignById.has(campaignId) ? 'campaign:' + campaignId : null;
    addEdge(campaignNodeId || ('domain:' + domain), id);
  }

  for (const [capabilityId, definition] of Object.entries(projection.capabilities)) {
    if (peerMembership.capabilityIds.has(capabilityId)) continue;
    const id = 'capability:' + capabilityId;
    addNode({
      id,
      type: 'CAPABILITY',
      label: capabilityId,
      domain: 'NEXO',
      state: 'SNAPSHOT',
      authority_class: 'NON_AUTHORITATIVE',
      source_ref: source,
      source_revision: manifest.tower_commit,
      fingerprint: nodeFingerprint('capability', capabilityId, manifest),
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      checked_at: observedAt,
      summary: 'Capability projection; canonical status=' + String(definition?.status || 'UNSPECIFIED') + '; backend=' + String(definition?.backend || 'UNSPECIFIED'),
      capability_id: capabilityId,
    });
    addEdge('domain:NEXO', id);
  }

  for (const filament of filaments) {
    const filamentId = 'filament:' + filament.id;
    addNode({
      id: filamentId,
      type: 'FILAMENT',
      label: filament.label,
      domain: filament.domain || filament.from_domain || 'NEXO',
      state: 'SNAPSHOT',
      authority_class: 'DERIVED',
      source_ref: filament.source_ref,
      source_revision: manifest.tower_commit,
      fingerprint: nodeFingerprint('learning', filament.id, manifest),
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      checked_at: observedAt,
      summary: filament.boundary,
      evidence: filament.evidence,
    });

    for (const link of filament.links || []) {
      if (!seen.has(link.id)) continue;
      edges.push({
        id: 'learning:' + sha256({ id: filament.id, target: link.id }).slice(7, 23),
        from: filamentId,
        to: link.id,
        kind: 'DERIVES_FROM',
        weight: filament.weight,
        explanation: 'Procedural Learning linked only by an explicit canonical reference in METALEARNING_CURRENT.',
        is_learning: true,
        learning_scope: link.domain === filament.domain ? 'INTRA_DOMAIN' : 'INTER_DOMAIN',
        learning_ref: filament.id,
      });
    }
    for (const ref of filament.learning_refs || []) {
      const target = 'filament:' + ref;
      if (!seen.has(target)) continue;
      edges.push({
        id: 'learning:' + sha256({ id: filament.id, parent: ref }).slice(7, 23),
        from: filamentId,
        to: target,
        kind: 'DERIVES_FROM',
        weight: filament.weight,
        explanation: 'Learning lineage declared by evidence_refs in METALEARNING_CURRENT.',
        is_learning: true,
        learning_scope: 'INTRA_DOMAIN',
        learning_ref: filament.id,
      });
    }

    const from = filament.from_id || ('domain:' + filament.from_domain);
    const to = filament.to_id || ('domain:' + filament.to_domain);
    if (filament.scope === 'INTER_DOMAIN' && seen.has(from) && seen.has(to) && from !== to) {
      edges.push({
        id: 'learning:' + sha256({ id: filament.id, from, to }).slice(7, 23),
        from,
        to,
        kind: 'SUPPORTS',
        weight: filament.weight,
        explanation: 'Derived cross-domain Learning bridge from explicit evidence endpoints; procedural only.',
        is_learning: true,
        learning_scope: 'INTER_DOMAIN',
        learning_ref: filament.id,
      });
    }
  }

  return { nodes, edges: edges.filter(edge => seen.has(edge.from) && seen.has(edge.to)) };
}

const HUMAN_DEPENDENCY_KIND = Object.freeze({
  HUMAN_AUTH_REQUIRED: 'CONFIGURAR_ACESSO',
  HUMAN_APPROVAL_REQUIRED: 'APROVAR',
  HUMAN_DECISION_REQUIRED: 'DECIDIR',
  HUMAN_INPUT_REQUIRED: 'FORNECER_DADO',
  HUMAN_RESPONSE_REQUIRED: 'RESPONDER',
  HUMAN_CHOICE_REQUIRED: 'ESCOLHER',
});

function dependencyClassOf(value) {
  return String(value?.dependency_class || value || '').trim().toUpperCase();
}

function dependencyClassesOf(item, detail) {
  const raw = [
    ...(Array.isArray(item?.dependency_classes) ? item.dependency_classes : []),
    ...(Array.isArray(detail?.dependency_classes) ? detail.dependency_classes : []),
    item?.dependency_class,
    detail?.dependency_class,
  ];
  return [...new Set(raw.map(dependencyClassOf).filter(Boolean))];
}

function humanKindFor(classes) {
  for (const dependencyClass of classes) {
    if (HUMAN_DEPENDENCY_KIND[dependencyClass]) return HUMAN_DEPENDENCY_KIND[dependencyClass];
  }
  if (classes.some(value => value.includes('AUTH'))) return 'CONFIGURAR_ACESSO';
  if (classes.some(value => value.includes('APPROV'))) return 'APROVAR';
  if (classes.some(value => value.includes('INPUT') || value.includes('DATA'))) return 'FORNECER_DADO';
  if (classes.some(value => value.includes('RESPOND'))) return 'RESPONDER';
  if (classes.some(value => value.includes('CHOICE') || value.includes('SELECT'))) return 'ESCOLHER';
  return 'DECIDIR';
}

function isHumanDependency(dep) {
  const dependencyClass = dependencyClassOf(dep);
  return dependencyClass.startsWith('HUMAN_') || dependencyClass.includes('AUTH_REQUIRED');
}

function dependencySemanticLabel(dep) {
  const declared = String(dep?.title || dep?.label || dep?.name || '').trim();
  if (declared) return declared;
  const dependencyClass = dependencyClassOf(dep);
  if (dependencyClass.includes('AUTH')) return 'Autorizar / configurar acesso externo';
  if (dependencyClass.includes('APPROV')) return 'Aprovar operação';
  if (dependencyClass.includes('DECISION')) return 'Tomar decisão humana';
  if (dependencyClass.includes('INPUT') || dependencyClass.includes('DATA')) return 'Fornecer informação exigida';
  if (dependencyClass.includes('EXTERNAL_TRANSIENT')) return 'Dependência externa transitória';
  if (dependencyClass.includes('CANONICAL_WORK')) return 'Aguardar WORK canônico';
  if (dependencyClass.includes('EXTERNAL')) return 'Dependência externa';
  const id = String(dep?.id || '').trim();
  return id
    ? id.replace(/[_:-]+/g, ' ').trim().toLowerCase().replace(/^./, char => char.toUpperCase())
    : 'Dependência declarada pela Tower';
}

function requirementFromDependency(dep, defaultRetryable = false) {
  const dependencyClass = dependencyClassOf(dep);
  return {
    id: String(dep?.id || dependencyClass || 'DEPENDENCY'),
    label: dependencySemanticLabel(dep),
    detail: String(dep?.detail || dep?.description || dep?.next_action || 'Dependência declarada pela Tower.'),
    state: dep?.state ? String(dep.state) : null,
    retryable: Boolean(dep?.auto_retry_eligible)
      || defaultRetryable
      || dependencyClass.includes('TRANSIENT')
      || dependencyClass.includes('RETRYABLE'),
  };
}

function humanInboxFromProjection(projection, observedAt, humanGateDetails = []) {
  const manifest = projection.manifest;
  const byId = new Map((projection.work || []).map(item => [String(item.id || ''), item]));
  const detailsById = new Map((Array.isArray(humanGateDetails) ? humanGateDetails : [])
    .map(item => [String(item?.id || ''), item]));
  const ids = Array.isArray(projection.human_gates?.work_ids) ? projection.human_gates.work_ids : [];

  return ids.map(rawId => {
    const id = String(rawId || '');
    const item = byId.get(id);
    if (!item) return null;

    const detail = detailsById.get(id) || {};
    const dependencyClasses = dependencyClassesOf(item, detail);
    const kind = humanKindFor(dependencyClasses);
    const projectedTitle = String(item.title || '').trim();
    const canonicalQuestion = String(detail.question || '').trim();
    const title = projectedTitle && projectedTitle !== id ? projectedTitle : (canonicalQuestion || id);
    const priority = String(item.priority || detail.priority || '').toUpperCase();
    const severity = priority === 'P0' || priority === 'CRITICAL' ? 'P0' : 'P1';
    const source = 'tower://' + String(manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault')
      + '@' + manifest.tower_commit + '/TOWER_V06/entities/work/' + id + '.json';

    const remaining = Array.isArray(detail.remaining_dependencies) ? detail.remaining_dependencies : [];
    const humanDependencies = remaining.filter(isHumanDependency);
    const automaticDependencies = remaining.filter(dep => !isHumanDependency(dep));

    const humanRequirements = humanDependencies.map(dep => requirementFromDependency(dep));
    if (humanRequirements.length === 0) {
      const rootHumanClass = dependencyClasses.find(value =>
        value.startsWith('HUMAN_') || value.includes('AUTH_REQUIRED')
      );
      if (rootHumanClass || kind !== 'DECIDIR') {
        humanRequirements.push(requirementFromDependency({
          id: rootHumanClass || 'HUMAN_GATE',
          dependency_class: rootHumanClass || 'HUMAN_ACTION_REQUIRED',
          detail: detail.next_action || detail.question || item.next_action || item.title
            || 'Ação humana exigida pela Tower para liberar este WORK.',
        }));
      }
    }

    const automaticRequirements = automaticDependencies.map(dep =>
      requirementFromDependency(dep, Boolean(detail.auto_retry_eligible || item.auto_retry_eligible))
    );

    const constraints = [
      ...(Array.isArray(item.constraints) ? item.constraints : []),
      ...(Array.isArray(detail.constraints) ? detail.constraints : []),
    ].map(String);
    const secureExternalAction = kind === 'CONFIGURAR_ACESSO';
    const explicitlyNoSecretInSource = constraints.some(value =>
      /NO_SECRETS_IN_CHAT|NO_STATIC_.*TOKEN|NO_SECRETS.*SOURCE/i.test(value)
    );
    const actionLocation = secureExternalAction
      ? (String(detail.action_location || '').trim()
        || (explicitlyNoSecretInSource
          ? 'Configurações seguras do provider/host. Não inserir segredo no chat ou no código-fonte.'
          : 'Configurações seguras do provider/host, fora do código-fonte.'))
      : (String(detail.action_location || '').trim() || null);

    const readbackCriteria = (Array.isArray(detail.acceptance) ? detail.acceptance : [])
      .map(String).filter(Boolean);
    const systemNext = String(detail.next_action || item.next_action || '').trim() || null;

    return {
      id: 'needs-dener:' + id,
      kind,
      domain: domainOf(item.domain),
      title,
      question: kind === 'CONFIGURAR_ACESSO'
        ? (humanRequirements.length > 1
          ? 'Configure as ' + humanRequirements.length + ' autorizações abaixo. O restante permanece com o NEXO/provider.'
          : 'Configure a autorização abaixo. O restante permanece com o NEXO/provider.')
        : canonicalQuestion || 'Executar a intervenção humana explicitamente exigida pela Tower.',
      why: 'Este WORK está no human_gates canônico da TOWER_V06. Só as dependências humanas abaixo são atribuídas a você.',
      action_id: null,
      options: [],
      human_requirements: humanRequirements,
      automatic_requirements: automaticRequirements,
      system_next: systemNext,
      readback_criteria: readbackCriteria,
      action_location: actionLocation,
      severity,
      due_at: null,
      source_ref: source,
      fingerprint: nodeFingerprint('needs-dener', id, manifest),
      checked_at: observedAt,
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
    };
  }).filter(Boolean);
}
function lanesFromProjection(projection, observedAt) {
  const source = sourceRef(projection.manifest);
  return projectionDomains(projection).filter(domain => domain !== 'NEXO').map(domain => {
    const work = projection.work.filter(item => domainOf(item.domain) === domain);
    const tests = projection.tests.filter(item => domainOf(item.domain || 'SCIENCE') === domain);
    const blocked = work.filter(item => projectionState(item.status || item.operational_status) === 'BLOCKED');
    return {
      domain,
      current_state: work.length + ' WORK · ' + tests.length + ' TEST in sanctioned projection',
      next_action: 'Await next canonical TOWER_V06 projection.',
      last_effect: null,
      blockers: blocked.map(item => String(item.id) + ': ' + String(item.status || item.operational_status || 'BLOCKED')),
      side_quests: [],
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      state: blocked.length ? 'BLOCKED' : 'SNAPSHOT',
      source_ref: source,
      fingerprint: nodeFingerprint('lane', domain, projection.manifest),
      checked_at: observedAt,
    };
  });
}

function worldItem(kind, item, projection, observedAt, index) {
  const manifest = projection.manifest;
  const rawId = String(item.id || kind + '-' + index);
  const domain = domainOf(item.domain || (kind === 'TEST' ? 'SCIENCE' : 'NEXO'));
  const contextId = domain === 'SCIENCE' ? 'COSMOLOGY' : domain;
  const blocked = projectionState(item.status || item.operational_status) === 'BLOCKED';
  const source = sourceUrl(manifest);
  return {
    id: 'nexo:' + kind.toLowerCase() + ':' + rawId,
    kind: 'ENTITY',
    title: String(item.title || rawId),
    summary: kind + ' · canonical status=' + String(item.status || item.operational_status || 'UNSPECIFIED'),
    source: 'nexo',
    sourceRef: source,
    authority: 'DERIVED',
    freshness: { state: 'SNAPSHOT', observedAt, expiresAt: observedAt },
    contextId,
    attention: blocked ? 'NOTICE' : 'IGNORE',
    attentionReason: blocked ? 'Canonical projected status requires attention.' : 'Projected from TOWER_V06.',
    actions: [{ id: 'open-tower-commit', label: 'Open Tower commit', kind: 'OPEN_SOURCE', url: source }],
    observedAt,
  };
}


function generalLearningFilaments(general, observedAt) {
  if (!general || typeof general !== 'object') return [];
  const records = Array.isArray(general.learning) ? general.learning : [];
  return records.flatMap(item => {
    const id = String(item?.id || '').trim();
    const status = String(item?.status || '').toUpperCase();
    if (!id || status === 'REJECTED' || status === 'RETIRED') return [];
    if (status !== 'PROMOTED' && item?.atlas_visible !== true) return [];

    const fromDomain = domainOf(item.from_domain || item.domain || 'NEXO');
    const toDomain = domainOf(item.to_domain || item.domain || fromDomain);
    return [{
      id,
      label: String(item.title || item.rule || id),
      domain: fromDomain,
      kind: 'PROCEDURAL',
      weight: status === 'PROMOTED' ? 0.9 : 0.68,
      support: Number.isFinite(Number(item.support)) ? Number(item.support) : 1,
      contradiction: Number.isFinite(Number(item.contradiction)) ? Number(item.contradiction) : 0,
      status: status === 'PROMOTED' ? 'ESTABLISHED' : 'PROVISIONAL',
      evidence: [String(item.source_ref || '')].filter(Boolean),
      source_ref: String(item.source_ref || 'drive://STAGING/GENERAL/LEARNING'),
      boundary: String(item.rule || item.summary || 'General procedural learning; derived from durable Drive state.'),
      from_label: String(item.from_label || 'NEXO General Learning'),
      to_label: String(item.to_label || toDomain),
      from_domain: fromDomain,
      to_domain: toDomain,
      from_id: item.from_id ? String(item.from_id) : undefined,
      to_id: item.to_id ? String(item.to_id) : undefined,
      scope: fromDomain === toDomain ? 'INTRA_DOMAIN' : 'INTER_DOMAIN',
      observed_at: String(item.updated_at || observedAt),
      links: [],
      learning_refs: [],
      general_fingerprint: item.fingerprint ? String(item.fingerprint) : undefined,
    }];
  });
}

function applyGeneralExecutionToGraph(graph, general, manifest, observedAt) {
  if (!general || typeof general !== 'object') return graph;
  const records = Array.isArray(general.execution) ? general.execution : [];
  const seen = new Set(graph.nodes.map(node => node.id));

  for (const item of records) {
    const atlasId = String(item?.atlas_id || '').trim();
    if (!atlasId) continue;
    const id = 'general:' + atlasId;
    if (seen.has(id)) continue;

    const domain = domainOf(item.domain || 'NEXO');
    const rawStatus = String(item.status || '').toUpperCase();
    const state = /BLOCK|FAIL|ERROR/.test(rawStatus) ? 'BLOCKED'
      : /STALE|DEGRADED|INCONCLUSIVE|WATCH/.test(rawStatus) ? 'DEGRADED'
      : 'LIVE';
    const updatedAt = String(item.updated_at || observedAt);
    const sourceRef = String(item.source_ref || 'drive://STAGING/GENERAL/EXECUTION');
    const fingerprint = String(item.fingerprint || nodeFingerprint('general', atlasId, manifest));

    graph.nodes.push({
      id,
      type: 'ACTION',
      label: String(item.title || atlasId),
      domain,
      state,
      authority_class: 'DERIVED',
      source_ref: sourceRef,
      source_revision: updatedAt,
      fingerprint,
      freshness: { state: 'RECENT', observed_at: updatedAt, ttl_seconds: null },
      checked_at: updatedAt,
      summary: String(item.summary || item.result || 'Durable General execution aggregate projected from Drive.'),
      atlas_general: true,
    });
    seen.add(id);

    const parent = 'domain:' + domain;
    if (seen.has(parent)) {
      graph.edges.push({
        id: 'general:' + sha256({ parent, id }).slice(7, 23),
        from: parent,
        to: id,
        kind: 'OWNS',
        weight: 0.82,
        explanation: 'Derived General execution aggregate. Drive remains authoritative.',
      });
    }
  }

  return graph;
}

export function buildPagesProjection({
  projection,
  manifestFile = null,
  interdomain = [],
  learning = {},
  peerDetectionBattery = null,
  humanGateDetails = [],
  general = {},
} = {}) {
  const manifest = validateSanctionedProjection(projection, manifestFile);
  const scienceProjection = buildScienceProjectionV1({ projection, manifest });
  const generatedAt = Date.parse(String(manifest.generated_at || ''));
  const observedAt = Number.isFinite(generatedAt) ? new Date(generatedAt).toISOString() : cursorTime(manifest.event_cursor);
  const source = sourceRef(manifest);
  const filaments = [
    ...learningFilamentsFromTower(interdomain, manifest, observedAt),
    ...proceduralLearningFilaments(learning, projection, manifest, observedAt),
    ...peerDetectionLearningFilaments(peerDetectionBattery, projection, manifest, observedAt),
    ...generalLearningFilaments(general, observedAt),
  ];
  const graph = applyGeneralExecutionToGraph(
    graphFromProjection(projection, observedAt, filaments, peerDetectionBattery),
    general,
    manifest,
    observedAt,
  );
  const humanWorkIds = new Set(Array.isArray(projection.human_gates?.work_ids)
    ? projection.human_gates.work_ids.map(value => String(value || ''))
    : []);
  const projectedWork = (projection.work || [])
    .map(item => projectedWorkNode(item, manifest, observedAt, humanWorkIds))
    .filter(Boolean);
  const lanes = lanesFromProjection(projection, observedAt);
  const inbox = humanInboxFromProjection(projection, observedAt, humanGateDetails);
  const capabilities = capabilitiesFromProjection(projection, source);
  const declaredCapabilityCount = Number(projection?.counts?.capabilities);
  if (Number.isFinite(declaredCapabilityCount) && declaredCapabilityCount !== capabilities.length) {
    throw new Error(
      'CAPABILITY_COUNT_DRIFT:declared=' + declaredCapabilityCount + ':compiled=' + capabilities.length,
    );
  }

  const system = {
    science_projection_v1: scienceProjection,
    contract_version: SYSTEM_CONTRACT,
    scenario_id: 'live',
    scenario_label: 'TOWER_V06 · sanctioned public projection',
    generated_at: observedAt,
    global_state: 'SNAPSHOT',
    bus: {
      fingerprint: manifest.projection_fingerprint,
      generated_at: observedAt,
      state: 'SNAPSHOT',
      envelope_count: 1,
      sources: [{
        id: 'tower_v06',
        label: 'TOWER_V06',
        source_revision: manifest.tower_commit,
        freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
        state: 'SNAPSHOT',
        envelopes: 1,
      }],
      consumers: [
        { id: 'nexo_one', label: 'NEXO ONE', state: 'SNAPSHOT', last_pull_at: observedAt },
        { id: 'atlas', label: 'Atlas', state: 'SNAPSHOT', last_pull_at: observedAt },
      ],
    },
    envelopes: [{
      entity_id: CONTRACT,
      domain: 'NEXO',
      authority_class: 'DERIVED',
      source_ref: source,
      source_revision: manifest.tower_commit,
      fingerprint: manifest.projection_fingerprint,
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      derivation_rule: 'TCC NEXO_PUBLIC_PROJECTION_V1; Pantheon performs presentation shaping only.',
      state: 'SNAPSHOT',
      checked_at: observedAt,
      projection_role: 'ATLAS',
      authoritative: false,
      title: 'TOWER_V06 sanctioned public projection',
      summary: projection.counts.active_work + ' active WORK · ' + projection.counts.tests + ' TEST · ' + projection.counts.capabilities + ' capabilities',
    }],
    findings: [{
      id: 'tower-v06-public-projection',
      domain: 'NEXO',
      status: 'SNAPSHOT',
      source_ref: source,
      fingerprint: manifest.projection_fingerprint,
      checked_at: observedAt,
      authority: { owner: 'TOWER_V06', class: 'DERIVED' },
      provider: { expected: 'TOWER_V06', observed: 'TOWER_V06' },
      capability: null,
      severity: 'INFO',
      explanation: 'Read-only sanctioned projection. Presentation cannot write back.',
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      source_observed_at: observedAt,
    }],
    actions: [],
    inbox,
    capabilities,
    runs: [],
    lanes,
    projected_work: projectedWork,
    graph,
    filaments,
    providers: [{
      id: 'nexo',
      label: 'TOWER_V06 sanctioned projection',
      expected_for: ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'],
      state: 'SNAPSHOT',
      capabilities: capabilities.map(capability => capability.capability_id),
      last_success_at: observedAt,
      checked_at: observedAt,
      explanation: 'projection_only=true · writeback=FORBIDDEN · ' + manifest.projection_fingerprint,
    }],
  };

  const items = [
    ...projection.work.map((item, index) => worldItem('WORK', item, projection, observedAt, index)),
    ...projection.tests.map((item, index) => worldItem('TEST', item, projection, observedAt, index)),
  ];
  const contextLabels = new Map([
    ['NEXO', 'NEXO'],
    ['COSMOLOGY', 'Cosmologia'],
    ['OLYMPUS', 'Olympus'],
    ['ENGINEERING', 'Engenharia'],
    ['PERSONAL', 'Pessoal'],
  ]);
  for (const item of items) {
    if (!contextLabels.has(item.contextId)) contextLabels.set(item.contextId, item.contextId);
  }
  const contexts = [...contextLabels].map(([id, title]) => ({
    id,
    title,
    description: 'Presentation-only context derived from TOWER_V06.',
    itemIds: items.filter(item => item.contextId === id).map(item => item.id),
    attentionCount: items.filter(item => item.contextId === id && ['ACT', 'ESCALATE'].includes(item.attention)).length,
    coverage: items.some(item => item.contextId === id) ? 'AVAILABLE' : 'UNAVAILABLE',
  }));

  const world = {
    version: WORLD_CONTRACT,
    fingerprint: 'WORLD-' + manifest.projection_fingerprint.slice(7, 23).toUpperCase(),
    generatedAt: observedAt,
    providers: [{
      id: 'nexo',
      label: 'TOWER_V06',
      status: 'AVAILABLE',
      lastSuccessAt: observedAt,
      checkedAt: observedAt,
      revision: manifest.tower_commit,
      message: 'Sanctioned public projection · ' + manifest.projection_fingerprint,
      partial: false,
      count: items.length,
    }],
    providers_total: 1,
    providers_available: 1,
    read_valid: true,
    items,
    contexts,
    issues: [],
    truthGraph: {
      fingerprint: manifest.projection_fingerprint,
      checked_at: observedAt,
      results: [{
        domain: 'NEXO',
        status: 'LIVE',
        source_ref: source,
        fingerprint: manifest.projection_fingerprint,
        checked_at: observedAt,
        material: false,
        explanation: 'TOWER_V06 is the sole authority; this object is a read-only projection.',
        authority: {
          canonical_truth: 'TOWER_V06',
          operational_truth: 'TOWER_V06',
          chat_role: 'CLIENT',
          conflict_rule: 'TOWER_V06_WINS_ON_ANY_STATE_DISAGREEMENT',
        },
        provider: {
          expected: 'TOWER_V06',
          actual: 'TOWER_V06',
          status: 'AVAILABLE',
          expected_status: 'AVAILABLE',
          partial: false,
          checked_at: observedAt,
        },
        capability: { state: 'SNAPSHOT', summary: 'Presentation projection only.', ids: [] },
        source_observed_at: observedAt,
      }],
      material_conflicts: [],
    },
    diff: { previous: null, current: manifest.projection_fingerprint, added: [], updated: [], removed: [], providerChanges: [] },
    access: 'PUBLIC',
  };

  return { system, world, scienceProjection };
}

export async function buildPagesSystemState(options = {}) {
  return (await buildPagesProjection(options)).system;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonIfPresent(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const projectionPath = resolve(process.env.NEXO_PUBLIC_PROJECTION || 'data/tower-public/projection.json');
  const manifestPath = resolve(process.env.NEXO_PUBLIC_PROJECTION_MANIFEST || 'data/tower-public/manifest.json');
  const interdomainPath = resolve(process.env.NEXO_PUBLIC_INTERDOMAIN || 'data/tower-public/interdomain.json');
  const learningPath = resolve(process.env.NEXO_PUBLIC_LEARNING || 'data/tower-public/learning.json');
  const peerDetectionBatteryPath = resolve(
    process.env.NEXO_PEER_DETECTION_BATTERY || 'data/tower-public/peer-detection-battery.json',
  );
  const humanGateDetailsPath = resolve(
    process.env.NEXO_PUBLIC_HUMAN_GATE_DETAILS || 'data/tower-public/human-gates-details.json',
  );
  const generalPath = resolve(
    process.env.NEXO_PUBLIC_GENERAL || 'data/general-public-projection.json',
  );
  const projection = await readJson(projectionPath);
  const manifestFile = await readJson(manifestPath);
  const interdomain = await readJsonIfPresent(interdomainPath);
  const learning = await readJsonIfPresent(learningPath);
  const peerDetectionBattery = await readJsonIfPresent(peerDetectionBatteryPath);
  const humanGateDetails = await readJsonIfPresent(humanGateDetailsPath);
  const general = await readJsonIfPresent(generalPath);
  const { system, world, scienceProjection } = buildPagesProjection({
    projection,
    manifestFile,
    interdomain,
    learning,
    peerDetectionBattery,
    humanGateDetails,
    general,
  });

  const dist = resolve('dist');
  const evidenceDir = resolve(dist, 'tower-projection');
  const contractsDir = resolve(dist, 'contracts');
  await Promise.all([mkdir(evidenceDir, { recursive: true }), mkdir(contractsDir, { recursive: true })]);
  await Promise.all([
    writeFile(resolve(dist, 'system.json'), JSON.stringify(system, null, 2) + '\n', 'utf8'),
    writeFile(resolve(dist, 'science-projection-v1.json'), JSON.stringify(scienceProjection, null, 2) + '\n', 'utf8'),
    writeFile(resolve(dist, 'world-public.ndjson'), JSON.stringify(world) + '\n', 'utf8'),
    copyFile(projectionPath, resolve(evidenceDir, 'projection.json')),
    copyFile(manifestPath, resolve(evidenceDir, 'manifest.json')),
    copyFile(resolve('contracts/science-projection-v1.schema.json'), resolve(contractsDir, 'science-projection-v1.schema.json')),
  ]);
  const scienceReadback = await readJson(resolve(dist, 'science-projection-v1.json'));
  validateScienceProjectionV1(scienceReadback);
}
