import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTRACT = 'NEXO_PUBLIC_PROJECTION_V1';
const SYSTEM_CONTRACT = '1';
const WORLD_CONTRACT = '1';
const DOMAINS = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'];

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
  if (domain === 'COSMOLOGY' || domain === 'SCIENCE') return 'SCIENCE';
  if (domain === 'ENGINEERING') return 'ENGINEERING';
  if (domain === 'OLYMPUS') return 'OLYMPUS';
  return 'NEXO';
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

function graphFromProjection(projection, observedAt) {
  const manifest = projection.manifest;
  const source = sourceRef(manifest);
  const nodes = [];
  const edges = [];
  const seen = new Set();

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

  for (const domain of DOMAINS) {
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

  for (const item of projection.work) {
    const rawId = String(item.id || '');
    if (!rawId) continue;
    const domain = domainOf(item.domain);
    const id = 'work:' + rawId;
    addNode({
      id,
      type: 'ACTION',
      label: String(item.title || rawId),
      domain,
      state: projectionState(item.status || item.operational_status),
      authority_class: 'NON_AUTHORITATIVE',
      source_ref: source,
      source_revision: manifest.tower_commit,
      fingerprint: nodeFingerprint('work', rawId, manifest),
      freshness: { state: 'RECENT', observed_at: observedAt, ttl_seconds: null },
      checked_at: observedAt,
      summary: 'WORK projected without reinterpretation; canonical status=' + String(item.status || item.operational_status || 'UNSPECIFIED'),
    });
    addEdge('domain:' + domain, id);
  }

  for (const item of projection.tests) {
    const rawId = String(item.id || '');
    if (!rawId) continue;
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
    });
    addEdge('domain:' + domain, id);
  }

  for (const [capabilityId, definition] of Object.entries(projection.capabilities)) {
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

  return { nodes, edges: edges.filter(edge => seen.has(edge.from) && seen.has(edge.to)) };
}

function lanesFromProjection(projection, observedAt) {
  const source = sourceRef(projection.manifest);
  return ['SCIENCE', 'ENGINEERING', 'OLYMPUS'].map(domain => {
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

export function buildPagesProjection({ projection, manifestFile = null } = {}) {
  const manifest = validateSanctionedProjection(projection, manifestFile);
  const observedAt = cursorTime(manifest.event_cursor);
  const source = sourceRef(manifest);
  const graph = graphFromProjection(projection, observedAt);
  const lanes = lanesFromProjection(projection, observedAt);

  const system = {
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
    inbox: [],
    capabilities: [],
    runs: [],
    lanes,
    graph,
    filaments: [],
    providers: [{
      id: 'nexo',
      label: 'TOWER_V06 sanctioned projection',
      expected_for: ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'],
      state: 'SNAPSHOT',
      capabilities: [],
      last_success_at: observedAt,
      checked_at: observedAt,
      explanation: 'projection_only=true · writeback=FORBIDDEN · ' + manifest.projection_fingerprint,
    }],
  };

  const items = [
    ...projection.work.map((item, index) => worldItem('WORK', item, projection, observedAt, index)),
    ...projection.tests.map((item, index) => worldItem('TEST', item, projection, observedAt, index)),
  ];
  const contexts = [
    ['NEXO', 'NEXO'],
    ['COSMOLOGY', 'Cosmologia'],
    ['OLYMPUS', 'Olympus'],
    ['ENGINEERING', 'Engenharia'],
    ['PERSONAL', 'Pessoal'],
  ].map(([id, title]) => ({
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

  return { system, world };
}

export async function buildPagesSystemState(options = {}) {
  return (await buildPagesProjection(options)).system;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const projectionPath = resolve(process.env.NEXO_PUBLIC_PROJECTION || 'data/tower-public/projection.json');
  const manifestPath = resolve(process.env.NEXO_PUBLIC_PROJECTION_MANIFEST || 'data/tower-public/manifest.json');
  const projection = await readJson(projectionPath);
  const manifestFile = await readJson(manifestPath);
  const { system, world } = buildPagesProjection({ projection, manifestFile });

  const dist = resolve('dist');
  const evidenceDir = resolve(dist, 'tower-projection');
  await mkdir(evidenceDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(dist, 'system.json'), JSON.stringify(system, null, 2) + '\n', 'utf8'),
    writeFile(resolve(dist, 'world-public.ndjson'), JSON.stringify(world) + '\n', 'utf8'),
    copyFile(projectionPath, resolve(evidenceDir, 'projection.json')),
    copyFile(manifestPath, resolve(evidenceDir, 'manifest.json')),
  ]);
}
