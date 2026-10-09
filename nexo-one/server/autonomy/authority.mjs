import {createHash, createHmac, createPublicKey, createVerify, randomBytes, timingSafeEqual} from 'node:crypto';

export const REPOSITORY = 'byDenoso/Pantheon';
export const WRITER_WORKFLOW = `${REPOSITORY}/.github/workflows/nexo-writer-robot.yml@refs/heads/main`;
export const RUNNER_WORKFLOW = `${REPOSITORY}/.github/workflows/nexo-test-battery.yml@refs/heads/main`;
export const HUMAN_ACTIONS = new Set(['APPROVE_AUTONOMY_MANDATE', 'REVOKE_AUTONOMY_MANDATE']);
export const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Same identity as the Writer: client-supplied transport/authority fields never
// become part of the human proposal. The attestation lives outside the envelope.
export function humanProposal(envelope) {
  if (!object(envelope) || envelope.kind !== 'OPERATOR_INTENT' || envelope.source !== 'DENER'
      || !object(envelope.payload) || !HUMAN_ACTIONS.has(envelope.payload.action)) throw new Error('HUMAN_INTENT_INVALID');
  const numbers = value => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('HUMAN_INTENT_NUMBER_INVALID');
    if (value && typeof value === 'object') for (const child of Object.values(value)) numbers(child);
  };
  numbers(envelope.payload);
  return Object.fromEntries(['kind', 'source', 'created_at', 'payload'].filter(k => Object.hasOwn(envelope, k)).map(k => [k, envelope[k]]));
}
export function attestHuman(envelope, env, now = Date.now()) {
  if ((env.NEXO_SESSION_SECRET?.length || 0) < 32) throw new Error('HUMAN_ATTESTATION_NOT_CONFIGURED');
  const proof = {contract: 'NEXO_HUMAN_AUTHORIZATION_V1', proposal_sha256: sha256(humanProposal(envelope)),
    subject: 'DENER', issued_at: new Date(now).toISOString(), nonce: randomBytes(16).toString('hex')};
  const signature = createHmac('sha256', env.NEXO_SESSION_SECRET).update('nexo-autonomy-human-v1\n' + canonical(proof)).digest('hex');
  return {...proof, signature};
}
export function verifyHuman(envelope, proof, env, now = Date.now()) {
  try {
    if ((env.NEXO_SESSION_SECRET?.length || 0) < 32 || !object(proof)
        || Object.keys(proof).sort().join(',') !== 'contract,issued_at,nonce,proposal_sha256,signature,subject'
        || proof.contract !== 'NEXO_HUMAN_AUTHORIZATION_V1' || proof.subject !== 'DENER'
        || !/^[a-f0-9]{32}$/.test(proof.nonce) || !/^[a-f0-9]{64}$/.test(proof.signature)
        || proof.proposal_sha256 !== sha256(humanProposal(envelope))
        || !Number.isFinite(Date.parse(proof.issued_at)) || Date.parse(proof.issued_at) > now + 60000) return false;
    const {signature, ...identity} = proof;
    const expected = createHmac('sha256', env.NEXO_SESSION_SECRET).update('nexo-autonomy-human-v1\n' + canonical(identity)).digest('hex');
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

// A separate audience and exact workflow/ref prevent a task, PR, or another
// workflow from borrowing the Writer's or scientific runner's identity.
export async function verifyActionsIdentity(req, {workflow, audience, fetcher = fetch, now = Date.now()} = {}) {
  try {
    const token = /^Bearer ([A-Za-z0-9_.-]{1,16384})$/.exec(req.headers?.authorization || '')?.[1];
    if (!token) return null;
    const [h, p, s, extra] = token.split('.');
    if (!h || !p || !s || extra) return null;
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || !header.kid || claims.iss !== 'https://token.actions.githubusercontent.com'
        || claims.aud !== audience || claims.repository !== REPOSITORY || claims.repository_visibility !== 'public'
        || claims.workflow_ref !== workflow || claims.ref !== 'refs/heads/main'
        || claims.sub !== `repo:${REPOSITORY}:ref:refs/heads/main`
        || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) || claims.exp <= now / 1000
        || claims.iat > now / 1000 + 60 || claims.exp - claims.iat > 3600 || claims.exp <= claims.iat
        || !/^[1-9][0-9]*$/.test(String(claims.run_id)) || !/^[1-9][0-9]*$/.test(String(claims.run_attempt))) return null;
    const response = await fetcher('https://token.actions.githubusercontent.com/.well-known/jwks',
      {redirect: 'error', signal: AbortSignal.timeout(5000)});
    if (!response.ok) return null;
    const jwk = (await response.json()).keys?.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = createPublicKey({key: jwk, format: 'jwk'});
    if (!createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s, 'base64url'))) return null;
    return {run_id: String(claims.run_id), run_attempt: Number(claims.run_attempt), workflow_ref: claims.workflow_ref};
  } catch { return null; }
}

export function scientificPackage(tower, batteryId, identity) {
  const control = tower?.files?.['CONTROL.json']?.value;
  const mandate = control?.autonomy_mandate;
  const ledger = tower?.files?.['evolution/batteries.json']?.value;
  const battery = ledger?.batteries?.find(row => row.id === batteryId);
  if (!mandate || mandate.schema !== 'NEXO_AUTONOMY_MANDATE_V1' || mandate.status !== 'ACTIVE'
      || mandate.domain !== 'OBSERVATIONAL_COSMOLOGY' || mandate.public_data_only !== true
      || mandate.no_additional_cost !== true || mandate.runner !== 'GITHUB_ACTIONS_STANDARD_PUBLIC') throw new Error('AUTONOMY_NOT_ACTIVE');
  if (!battery || battery.transport !== 'CANONICAL_DRIVE_PACKAGE' || battery.mandate_id !== mandate.id
      || battery.mandate_revision !== mandate.revision) throw new Error('SCIENTIFIC_RESERVATION_MISMATCH');
  if (!['DISPATCH_PENDING', 'DISPATCHED', 'RUNNING'].includes(battery.status)) throw new Error('SCIENTIFIC_RESERVATION_NOT_ACTIVE');
  if (battery.run_ref !== `actions/runs/${identity.run_id}`) throw new Error('SCIENTIFIC_RUN_BINDING_PENDING');
  if (identity.run_attempt !== 1) throw new Error('SCIENTIFIC_RUN_REPLAY_REFUSED');
  if (![1, 2, 4].includes(battery.parallelism)
      || !Array.isArray(battery.tests) || !battery.tests.length || battery.tests.length > 20) throw new Error('SCIENTIFIC_PACKAGE_INVALID');
  const ids = new Set();
  for (const test of battery.tests) {
    if (!object(test) || !test.test_id || ids.has(test.test_id) || !test.attempt_id || !test.execution_fingerprint
        || !/^[a-z0-9_]{2,40}$/.test(test.recipe || '') || !/^[a-f0-9]{64}$/.test(test.recipe_sha256 || '')
        || !/^[a-f0-9]{40}$/.test(test.recipe_revision || '') || !object(test.params)
        || test.private === true || String(test.domain || '').toUpperCase() === 'OLYMPUS'
        || test.script || !Number.isInteger(test.timeout_min) || test.timeout_min < 1 || test.timeout_min > 340) throw new Error('SCIENTIFIC_PACKAGE_INVALID');
    ids.add(test.test_id);
    const source = tower.files?.[`entities/test/${test.test_id}.json`]?.value;
    const inputs = (source?.data_binding || source?.input_binding)?.inputs;
    const publicInput = value => {
      if (!object(value) || value.public !== true || !/^(?:sha256:)?[0-9a-f]{64}$/.test(value.sha256 || '')) return false;
      if (value.kind === 'generated') return Boolean(value.generator) && Number.isSafeInteger(value.seed);
      try {
        const url = new URL(value.url || value.source_url);
        return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
      } catch { return false; }
    };
    if (source?.kind !== 'TEST' || source.id !== test.test_id || source.mandate_id !== mandate.id
        || source.public_data_only !== true || source.visibility !== 'PUBLIC'
        || source.attempt_id !== test.attempt_id || source.battery_id !== battery.id
        || source.recipe !== test.recipe || source.execution_recipe_sha256 !== test.recipe_sha256
        || canonical(source.recipe_params) !== canonical(test.params)
        || !Array.isArray(inputs) || !inputs.length || !inputs.every(publicInput)
        || canonical(test.inputs) !== canonical(inputs)) throw new Error('SCIENTIFIC_PUBLIC_PROVENANCE_REQUIRED');
  }
  const frozen = {schema: 'NEXO_SCIENTIFIC_PACKAGE_V1', battery_id: battery.id,
    mandate_id: battery.mandate_id, mandate_revision: battery.mandate_revision,
    source_revision: battery.source_revision, parallelism: battery.parallelism, tests: battery.tests};
  // Preserve Python's numeric encoding of the frozen scientific parameters.
  // Parsing and re-encoding the bytes in JavaScript would change e.g. 70.0.
  if (!battery.source_revision || typeof battery.package_json !== 'string'
      || Buffer.byteLength(battery.package_json) > 262144 || battery.package_sha256 !== sha256(battery.package_json)
      || canonical(JSON.parse(battery.package_json)) !== canonical(frozen)) throw new Error('SCIENTIFIC_PACKAGE_HASH_MISMATCH');
  return {...frozen, package_json:battery.package_json, package_sha256: battery.package_sha256};
}
