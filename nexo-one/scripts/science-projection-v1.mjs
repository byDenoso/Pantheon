import { createHash } from 'node:crypto';

export const SCIENCE_PROJECTION_CONTRACT = 'NEXO_SCIENCE_PROJECTION_V1';
const VERDICTS = new Set(['SUPPORTS', 'NULL', 'FALSIFIES', 'INCONCLUSIVE', 'PENDING']);
const CLAIM_LEVELS = new Set(['sugere', 'indica', 'demonstra', 'suggests', 'indicates', 'demonstrates']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

const stable = value => JSON.stringify(canonical(value));
const sha256 = value => 'sha256:' + createHash('sha256').update(stable(value)).digest('hex');

function reject(message) {
  const error = new Error(message);
  error.code = 'INVALID_SCIENCE_PROJECTION';
  throw error;
}

function sourcePath(kind, id) {
  const safeKind = encodeURIComponent(kind);
  const safeId = encodeURIComponent(id);
  return `TOWER_V06/projections/public/projection.json#${safeKind}/${safeId}`;
}

function envelope(value, present, unavailableReason, manifest, path, field) {
  const sourceRef = `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/${path}`;
  return {
    value: present ? value : null,
    unavailable_reason: present ? null : unavailableReason,
    source_ref: sourceRef,
    fingerprint: sha256({ source_fingerprint: manifest.projection_fingerprint, path, field }),
  };
}

function firstOwn(object, names) {
  for (const name of names) {
    if (Object.hasOwn(object || {}, name)) return { present: true, value: object[name], name };
  }
  return { present: false, value: null, name: names[0] };
}

function field(object, names, reason, manifest, path) {
  const found = firstOwn(object, names);
  const hasValue = found.present && found.value !== null && found.value !== undefined;
  return envelope(hasValue ? found.value : null, hasValue, found.present ? 'Tower explicitly published null for this field.' : reason,
    manifest, path, found.name);
}

function normalizedStatus(object, names, reason, manifest, path) {
  const found = firstOwn(object, names);
  const value = typeof found.value === 'string' ? found.value : found.value;
  return envelope(found.present && value != null ? value : null, found.present && value != null,
    found.present ? 'Tower explicitly published null for this field.' : reason, manifest, path, found.name);
}

function normalizedVerdict(raw, manifest, path) {
  const found = firstOwn(raw, ['scientific_verdict', 'verdict']);
  const value = typeof found.value === 'string' ? found.value.toUpperCase() : '';
  if (found.present && VERDICTS.has(value)) return envelope(value, true, null, manifest, path, found.name);
  const reason = found.present
    ? 'Published value is not an approved scientific verdict; operational or governance PASS is not scientific evidence.'
    : 'Scientific verdict is not published in the sanctioned projection.';
  return envelope(null, false, reason, manifest, path, found.name);
}

function normalizedClaimLevel(raw, manifest, path) {
  const found = firstOwn(raw, ['claim_level']);
  const value = typeof found.value === 'string' ? found.value.toLowerCase() : '';
  if (found.present && CLAIM_LEVELS.has(value)) return envelope(value, true, null, manifest, path, found.name);
  return envelope(null, false, found.present
    ? 'Published claim level is not one of the calibrated levels.'
    : 'Calibrated claim level is not published in the sanctioned projection.', manifest, path, found.name);
}

function makeRecord(record, kind, manifest, mapping) {
  const id = String(record?.campaign_id || record?.hypothesis_id || record?.id || record?.entity_id || '').trim();
  if (!id) return null;
  const path = sourcePath(kind, id);
  return Object.fromEntries([...Object.entries(mapping).map(([key, config]) => [
    key,
    config.special === 'verdict'
      ? normalizedVerdict(record, manifest, path)
      : config.special === 'claim_level'
        ? normalizedClaimLevel(record, manifest, path)
        : config.special === 'status'
          ? normalizedStatus(record, config.names, config.reason, manifest, path)
          : field(record, config.names, config.reason, manifest, path),
  ]), ['id', id], ['source_ref', `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/${path}`], ['fingerprint', sha256({ source_fingerprint: manifest.projection_fingerprint, path })]]);
}

function mapRecords(records, kind, manifest, mapping) {
  return (Array.isArray(records) ? records : []).map(record => makeRecord(record, kind, manifest, mapping)).filter(Boolean);
}

const campaignFields = {
  question: { names: ['question', 'scientific_question'], reason: 'Campaign question is not published in the sanctioned projection.' },
  hypothesis_ids: { names: ['hypothesis_ids', 'hypothesis_refs', 'hypothesis_ref'], reason: 'Campaign hypothesis references are not published in the sanctioned projection.' },
  status: { names: ['status', 'state'], reason: 'Campaign status is not published in the sanctioned projection.', special: 'status' },
  prereg_ref: { names: ['prereg_ref', 'preregistration_ref'], reason: 'Campaign preregistration reference is not published in the sanctioned projection.' },
  started_at: { names: ['started_at'], reason: 'Campaign start time is not published in the sanctioned projection.' },
  members: { names: ['members', 'test_ids'], reason: 'Campaign members are not published in the sanctioned projection.' },
};

const hypothesisFields = {
  statement: { names: ['statement', 'proposition'], reason: 'Hypothesis statement is not published in the sanctioned projection.' },
  model: { names: ['model'], reason: 'Hypothesis model is not published in the sanctioned projection.' },
  baseline: { names: ['baseline'], reason: 'Hypothesis baseline is not published in the sanctioned projection.' },
  falsification_criterion: { names: ['falsification_criterion', 'kill_criteria'], reason: 'Hypothesis falsification criterion is not published in the sanctioned projection.' },
};

function testRecord(raw, manifest) {
  const inputContract = raw?.input_contract && typeof raw.input_contract === 'object' ? raw.input_contract : {};
  const decisionContract = raw?.decision_contract && typeof raw.decision_contract === 'object' ? raw.decision_contract : {};
  const datasetFound = firstOwn(raw, ['datasets', 'dataset']);
  const datasets = datasetFound.present
    ? (Array.isArray(datasetFound.value) ? datasetFound.value : [datasetFound.value])
      .filter(value => typeof value === 'string' || typeof value === 'number')
      .map(value => ({ dataset: value }))
    : inputContract.dataset
      ? [{ dataset: inputContract.dataset, hashes: Object.fromEntries(['dataset_hash', 'table_hash', 'covariance_hash'].filter(key => typeof inputContract[key] === 'string').map(key => [key, inputContract[key]])) }]
      : null;
  const metric = firstOwn(raw, ['preregistered_metric', 'metric']);
  const threshold = firstOwn(raw, ['threshold', 'preregistered_threshold']);
  const base = makeRecord(raw, 'test', manifest, {
    campaign_id: { names: ['campaign_id'], reason: 'Test campaign reference is not published in the sanctioned projection.' },
    hypothesis_id: { names: ['hypothesis_id', 'hypothesis_ref'], reason: 'Test hypothesis reference is not published in the sanctioned projection.' },
    method: { names: ['method', 'methodology', 'mechanism'], reason: 'Test method is not published in the sanctioned projection.' },
    datasets: { names: [], reason: '' },
    preregistered_metric: { names: [], reason: '' },
    threshold: { names: [], reason: '' },
    verdict: { names: [], reason: '', special: 'verdict' },
    claim_level: { names: [], reason: '', special: 'claim_level' },
  });
  if (!base) return null;
  const path = sourcePath('test', base.id);
  for (const [key, found, value, absence] of [
    ['datasets', datasetFound, datasets, 'Test datasets are not published in the sanctioned projection.'],
    ['preregistered_metric', metric, metric.present ? metric.value : firstOwn(decisionContract, ['preregistered_metric', 'metric']), null],
    ['threshold', threshold, threshold.present ? threshold.value : firstOwn(decisionContract, ['threshold', 'preregistered_threshold']), null],
  ]) {
    let hasValue = false;
    let resolved = value;
    let fieldName = key;
    let reason = absence;
    if (key === 'datasets') {
      hasValue = Array.isArray(resolved) && resolved.length > 0;
      fieldName = datasetFound.name || 'input_contract.dataset';
    } else {
      const selected = value && typeof value === 'object' && Object.hasOwn(value, 'present') ? value : null;
      hasValue = selected ? selected.present && selected.value != null : found.present && found.value != null;
      if (selected) { resolved = selected.value; fieldName = selected.name; }
      else { resolved = found.value; fieldName = found.name; }
      reason = hasValue ? null : 'Prerequisite metric or threshold is not published in the sanctioned projection.';
    }
    base[key] = envelope(hasValue ? resolved : null, hasValue,
      hasValue ? null : reason || (found.present ? 'Tower explicitly published null for this field.' : 'Field is not published in the sanctioned projection.'),
      manifest, path, fieldName);
  }
  const result = raw?.result && typeof raw.result === 'object' ? raw.result : raw?.scientific_result;
  const statistics = raw?.statistics || raw?.scientific_result?.statistics || {};
  base.result = Object.fromEntries(['parameter', 'value', 'err_lo', 'err_hi', 'unit'].map(key => {
    const found = firstOwn(result, [key]);
    return [key, envelope(found.present && found.value != null ? found.value : null, found.present && found.value != null,
      found.present ? 'Tower explicitly published null for this field.' : `Test result ${key} is not published in the sanctioned projection.`, manifest, path, `result.${key}`)];
  }));
  base.statistics = Object.fromEntries(['delta_chi2', 'delta_bic', 'ln_bayes_factor', 'sigma_raw', 'sigma_lee', 'p_value'].map(key => {
    const found = firstOwn(statistics, [key]);
    return [key, envelope(found.present && found.value != null ? found.value : null, found.present && found.value != null,
      found.present ? 'Tower explicitly published null for this field.' : `Statistic ${key} is not published in the sanctioned projection.`, manifest, path, `statistics.${key}`)];
  }));
  const checks = firstOwn(raw, ['robustness_checks']);
  const safeChecks = checks.present && Array.isArray(checks.value) ? checks.value.map((item, index) => ({
    id: typeof item?.id === 'string' ? item.id : `check-${index + 1}`,
    name: typeof item?.name === 'string' ? item.name : null,
    status: ['PASS', 'FAIL', 'PENDING', 'INCONCLUSIVE'].includes(String(item?.status || '').toUpperCase()) ? String(item.status).toUpperCase() : null,
  })) : null;
  base.robustness_checks = envelope(safeChecks, safeChecks !== null, checks.present
      ? 'Tower robustness_checks is not an array.'
      : 'Robustness checks are not published on this test in the sanctioned projection.', manifest, path, 'robustness_checks');
  const artifacts = firstOwn(raw, ['artifacts', 'artifact_refs', 'evidence_refs']);
  const safeArtifacts = artifacts.present && Array.isArray(artifacts.value)
    ? artifacts.value.flatMap(item => {
      const ref = typeof item === 'string' ? item : String(item?.ref || item?.path || item?.id || '');
      if (!(ref.startsWith('TOWER_V06/') || ref.startsWith('tower://'))) return [];
      const rawHash = typeof item === 'object' ? String(item.sha256 || item.hash || '') : '';
      const hash = /^sha256:[0-9a-f]{64}$/i.test(rawHash) ? rawHash : /^[0-9a-f]{64}$/i.test(rawHash) ? `sha256:${rawHash}` : null;
      return [{ ref, sha256: hash, kind: typeof item === 'object' && typeof item.kind === 'string' ? item.kind : null }];
    })
    : null;
  base.artifacts = envelope(safeArtifacts, safeArtifacts !== null, artifacts.present
    ? 'No Tower_V06 artifact reference was published for this test.'
    : 'Artifacts are not published in the sanctioned projection.', manifest, path, 'artifacts');
  const reproducibility = raw?.reproducibility || {};
  base.reproducibility = Object.fromEntries(['script_hash', 'commit', 'seed', 'data_lock'].map(key => {
    const found = firstOwn(reproducibility, [key]);
    return [key, envelope(found.present && found.value != null ? found.value : null, found.present && found.value != null,
      found.present ? 'Tower explicitly published null for this field.' : `Reproducibility field ${key} is not published in the sanctioned projection.`, manifest, path, `reproducibility.${key}`)];
  }));
  const audit = firstOwn(raw?.audit, ['data_lock']);
  base.audit = { data_lock: envelope(audit.present && typeof audit.value === 'boolean' ? audit.value : null,
    audit.present && typeof audit.value === 'boolean', audit.present
      ? 'Tower published a non-boolean data-lock audit value.'
      : 'Data-lock audit decision is not published in the sanctioned projection.', manifest, path, 'audit.data_lock') };
  return base;
}

export function buildScienceProjectionV1({ projection, manifest } = {}) {
  if (!manifest || manifest.authority !== 'TOWER_V06' || manifest.projection_only !== true || manifest.writeback !== 'FORBIDDEN') {
    reject('source identity must be a read-only TOWER_V06 public projection');
  }
  if (!/^[0-9a-f]{40}$/i.test(String(manifest.tower_commit || '')) || !/^sha256:[0-9a-f]{64}$/i.test(String(manifest.projection_fingerprint || ''))) {
    reject('source identity requires Tower commit and projection fingerprint');
  }
  const base = {
    contract: SCIENCE_PROJECTION_CONTRACT,
    version: 1,
    source: {
      authority: 'TOWER_V06',
      tower_repository: manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault',
      tower_commit: manifest.tower_commit,
      projection_fingerprint: manifest.projection_fingerprint,
      projection_ref: `tower://${manifest.tower_repository || 'byDenoso/NEXO-Obsidian-Vault'}@${manifest.tower_commit}/TOWER_V06/projections/public/projection.json`,
      writeback: 'FORBIDDEN',
    },
    campaigns: mapRecords(projection?.campaigns, 'campaign', manifest, campaignFields),
    hypotheses: mapRecords(projection?.hypotheses, 'hypothesis', manifest, hypothesisFields),
    tests: (Array.isArray(projection?.tests) ? projection.tests : []).map(item => testRecord(item, manifest)).filter(Boolean),
  };
  const output = { ...base, fingerprint: sha256(base) };
  validateScienceProjectionV1(output);
  return output;
}

function assertEnvelope(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'value') || !Object.hasOwn(value, 'unavailable_reason')) {
    reject(`${path} must be a value/reason envelope`);
  }
  if (typeof value.source_ref !== 'string' || !value.source_ref.startsWith('tower://')) reject(`${path} source_ref missing`);
  if (!/^sha256:[0-9a-f]{64}$/i.test(String(value.fingerprint || ''))) reject(`${path} fingerprint invalid`);
  if (value.value === null && (typeof value.unavailable_reason !== 'string' || !value.unavailable_reason.trim())) reject(`${path} null value requires an unavailable reason`);
  if (value.value !== null && value.unavailable_reason !== null) reject(`${path} published value cannot have an unavailable reason`);
}

export function validateScienceProjectionV1(output) {
  if (!output || output.contract !== SCIENCE_PROJECTION_CONTRACT || output.version !== 1) reject('contract/version invalid');
  if (output.source?.authority !== 'TOWER_V06' || output.source?.writeback !== 'FORBIDDEN'
    || !/^sha256:[0-9a-f]{64}$/i.test(String(output.source?.projection_fingerprint || ''))
    || !String(output.source?.tower_commit || '').match(/^[0-9a-f]{40}$/i)
    || !String(output.source?.projection_ref || '').startsWith('tower://')) reject('source identity invalid');
  for (const collection of ['campaigns', 'hypotheses', 'tests']) {
    if (!Array.isArray(output[collection])) reject(`${collection} must be an array`);
    const allowedFields = {
      campaigns: ['question', 'hypothesis_ids', 'status', 'prereg_ref', 'started_at', 'members'],
      hypotheses: ['statement', 'model', 'baseline', 'falsification_criterion'],
      tests: ['campaign_id', 'hypothesis_id', 'method', 'datasets', 'preregistered_metric', 'threshold', 'verdict', 'claim_level', 'result', 'statistics', 'robustness_checks', 'artifacts', 'reproducibility', 'audit'],
    }[collection];
    for (const record of output[collection]) {
      if (!record || typeof record.id !== 'string') reject(`${collection} record identity missing`);
      if (!String(record.source_ref || '').startsWith('tower://')) reject(`${collection}.${record.id} source_ref missing`);
      if (!/^sha256:[0-9a-f]{64}$/i.test(String(record.fingerprint || ''))) reject(`${collection}.${record.id} fingerprint invalid`);
      const unknownFields = Object.keys(record).filter(key => !['id', 'source_ref', 'fingerprint', ...allowedFields].includes(key));
      if (unknownFields.length) reject(`${collection}.${record.id} contains uncontracted fields: ${unknownFields.join(',')}`);
      for (const [key, value] of Object.entries(record)) {
        if (key === 'id' || key === 'source_ref' || key === 'fingerprint') continue;
        const visit = (current, currentPath) => {
          if (current && typeof current === 'object' && !Array.isArray(current) && Object.hasOwn(current, 'value') && Object.hasOwn(current, 'source_ref')) {
            assertEnvelope(current, currentPath);
          } else if (current && typeof current === 'object' && !Array.isArray(current)) {
            for (const [childKey, child] of Object.entries(current)) visit(child, `${currentPath}.${childKey}`);
          } else reject(`${currentPath} must be an evidence envelope`);
        };
        visit(value, `${collection}.${record.id}.${key}`);
      }
    }
  }
  const base = { ...output };
  delete base.fingerprint;
  if (output.fingerprint !== sha256(base)) reject('science projection fingerprint mismatch');
  return output;
}
