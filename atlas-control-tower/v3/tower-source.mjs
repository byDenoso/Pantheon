import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertPublicEntitySafe, assertTowerControl, safePublicText } from './contracts.mjs';

const CONTROL_FIELDS = [
  'schema_version', 'truth_owner', 'write_model', 'drive_role', 'drive_sync_model',
  'drive_writeback_to_truth', 'atlas_role', 'atlas_truth_source', 'atlas_writeback_to_truth', 'interdomain_layer'
];

const WORK_FIELDS = ['kind', 'domain', 'status', 'owner_role', 'writer_role', 'priority', 'entity_version'];
const HYPOTHESIS_FIELDS = ['domain', 'status', 'priority', 'entity_version'];
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

async function readJsonOptional(file, fallback) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function sanitizeControl(control) {
  assertTowerControl(control);
  return pick(control, CONTROL_FIELDS);
}

function normalizedIdentity(entity, ...candidates) {
  for (const key of candidates) {
    if (entity?.[key]) return String(entity[key]);
  }
  return null;
}

function safeIdentityEnvelope(entity, id) {
  return id ? assertPublicEntitySafe({ ...entity, id }) : false;
}

function sanitizeWork(entity) {
  const id = normalizedIdentity(entity, 'id', 'work_id', 'entity_id');
  if (!safeIdentityEnvelope(entity, id)) return null;
  return { id, ...pick(entity, WORK_FIELDS) };
}

function sanitizeHypothesis(entity) {
  const id = normalizedIdentity(entity, 'id', 'entity_id');
  if (!safeIdentityEnvelope(entity, id)) return null;
  const out = {
    id,
    kind: String(entity.kind || entity.entity_type || 'HYPOTHESIS'),
    ...pick(entity, HYPOTHESIS_FIELDS)
  };
  const label = safePublicText(entity.label || entity.name || entity.title || entity.question);
  if (label) out.label = label;
  return out;
}

function sanitizeInterdomain(entity) {
  const id = normalizedIdentity(entity, 'id', 'entity_id');
  if (!safeIdentityEnvelope(entity, id)) return null;
  const out = {
    id,
    kind: String(entity.kind || entity.entity_type || 'INTERDOMAIN'),
    ...pick(entity, ['status', 'relation_type', 'entity_version'])
  };
  for (const field of INTERDOMAIN_ARRAY_FIELDS) {
    const values = safeArray(entity[field]);
    if (values.length) out[field] = values;
  }
  for (const field of ['mapping', 'prediction_or_utility', 'falsifier_or_validation']) {
    const value = safePublicText(entity[field]);
    if (value) out[field] = value;
  }
  return out;
}

function sanitizeProgram(entity) {
  const id = normalizedIdentity(entity, 'id', 'program_id');
  if (!safeIdentityEnvelope(entity, id)) return null;
  const out = { id, kind: 'PROGRAM' };
  const label = safePublicText(entity.title || entity.label || entity.name);
  if (label) out.label = label;
  if (entity.status != null) out.status = entity.status;
  if (Number.isFinite(Number(entity.campaign_count))) out.campaign_count = Number(entity.campaign_count);
  return out;
}

function sanitizeCampaign(entity) {
  const id = normalizedIdentity(entity, 'id', 'campaign_id');
  if (!safeIdentityEnvelope(entity, id)) return null;
  const out = { id, kind: 'CAMPAIGN' };
  const label = safePublicText(entity.title || entity.label || entity.name);
  if (label) out.label = label;
  if (entity.status != null) out.status = entity.status;
  if (entity.program_id != null && safePublicText(entity.program_id) != null) out.program_id = String(entity.program_id);
  if (Number.isFinite(Number(entity.test_count))) out.test_count = Number(entity.test_count);
  return out;
}

function semanticRevision(payload) {
  return `tower-hotset:sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export async function buildSanitizedTowerSource({ towerDir, sourceRevision, generatedAt } = {}) {
  if (!towerDir) throw new Error('ATLAS_V3_TOWER_DIR_REQUIRED');
  const control = sanitizeControl(await readJson(path.join(towerDir, 'CONTROL.json')));
  const indexes = path.join(towerDir, 'indexes');
  const workIndex = await readJson(path.join(indexes, 'active-work.json'));
  const programIndex = await readJsonOptional(path.join(indexes, 'programs.json'), { programs: [] });
  const campaignIndex = await readJsonOptional(path.join(indexes, 'campaigns.json'), { campaigns: [] });

  const work = (Array.isArray(workIndex?.work) ? workIndex.work : []).map(sanitizeWork).filter(Boolean);
  const program = (Array.isArray(programIndex?.programs) ? programIndex.programs : []).map(sanitizeProgram).filter(Boolean);
  const campaign = (Array.isArray(campaignIndex?.campaigns) ? campaignIndex.campaigns : []).map(sanitizeCampaign).filter(Boolean);
  const interdomain = (await readJsonDirectory(path.join(towerDir, 'entities', 'interdomain'))).map(sanitizeInterdomain).filter(Boolean);
  const hypothesis = (await readJsonDirectory(path.join(towerDir, 'entities', 'hypothesis'))).map(sanitizeHypothesis).filter(Boolean);

  const byId = values => values.sort((a, b) => a.id.localeCompare(b.id));
  const entities = {
    program: byId(program),
    campaign: byId(campaign),
    hypothesis: byId(hypothesis),
    interdomain: byId(interdomain),
    work: byId(work)
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
