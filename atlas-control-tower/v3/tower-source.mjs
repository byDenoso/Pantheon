import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertPublicEntitySafe, assertTowerControl, safePublicText } from './contracts.mjs';

const CONTROL_FIELDS = [
  'schema_version', 'truth_owner', 'write_model', 'drive_role', 'drive_sync_model',
  'drive_writeback_to_truth', 'atlas_role', 'atlas_truth_source', 'atlas_writeback_to_truth', 'interdomain_layer'
];

const WORK_FIELDS = ['id', 'kind', 'domain', 'status', 'owner_role', 'writer_role', 'priority', 'entity_version'];
const HYPOTHESIS_FIELDS = ['id', 'kind', 'domain', 'status', 'priority', 'entity_version'];
const INTERDOMAIN_ARRAY_FIELDS = ['source_domains', 'target_domains', 'source_nodes', 'test_refs', 'evidence_refs', 'lesson_refs', 'novelty_refs'];

const pick = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] != null).map(key => [key, value[key]]));
const safeArray = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && safePublicText(item) != null) : [];
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

async function readJsonDirectory(dir) {
  try {
    const names = (await readdir(dir)).filter(name => name.endsWith('.json')).sort();
    return Promise.all(names.map(name => readJson(path.join(dir, name))));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function sanitizeControl(control) {
  assertTowerControl(control);
  return pick(control, CONTROL_FIELDS);
}

function sanitizeWork(entity) {
  if (!entity?.id || !assertPublicEntitySafe(entity)) return null;
  return pick(entity, WORK_FIELDS);
}

function sanitizeHypothesis(entity) {
  if (!entity?.id || !assertPublicEntitySafe(entity)) return null;
  const out = pick(entity, HYPOTHESIS_FIELDS);
  const label = safePublicText(entity.label || entity.name || entity.title || entity.question);
  if (label) out.label = label;
  return out;
}

function sanitizeInterdomain(entity) {
  if (!entity?.id || !assertPublicEntitySafe(entity)) return null;
  const out = {
    ...pick(entity, ['id', 'kind', 'status', 'relation_type', 'entity_version'])
  };
  for (const field of INTERDOMAIN_ARRAY_FIELDS) {
    const values = safeArray(entity[field]);
    if (values.length) out[field] = values;
  }
  for (const [source, target] of [
    ['mapping', 'mapping'],
    ['prediction_or_utility', 'prediction_or_utility'],
    ['falsifier_or_validation', 'falsifier_or_validation']
  ]) {
    const value = safePublicText(entity[source]);
    if (value) out[target] = value;
  }
  return out;
}

function semanticRevision(payload) {
  return `tower-hotset:sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export async function buildSanitizedTowerSource({ towerDir, sourceRevision, generatedAt } = {}) {
  if (!towerDir) throw new Error('ATLAS_V3_TOWER_DIR_REQUIRED');
  const control = sanitizeControl(await readJson(path.join(towerDir, 'CONTROL.json')));
  const workIndex = await readJson(path.join(towerDir, 'indexes', 'active-work.json'));
  const work = (Array.isArray(workIndex?.work) ? workIndex.work : []).map(sanitizeWork).filter(Boolean);
  const interdomain = (await readJsonDirectory(path.join(towerDir, 'entities', 'interdomain'))).map(sanitizeInterdomain).filter(Boolean);
  const hypothesis = (await readJsonDirectory(path.join(towerDir, 'entities', 'hypothesis'))).map(sanitizeHypothesis).filter(Boolean);

  const entities = {
    hypothesis: hypothesis.sort((a, b) => a.id.localeCompare(b.id)),
    interdomain: interdomain.sort((a, b) => a.id.localeCompare(b.id)),
    work: work.sort((a, b) => a.id.localeCompare(b.id))
  };
  const semantic = { control, entities };

  return {
    control,
    sourceVersion: sourceRevision || semanticRevision(semantic),
    generatedAt: generatedAt || new Date().toISOString(),
    completeness: 'PARTIAL_TOWER_HOT_SET',
    publicProjection: true,
    entities
  };
}
