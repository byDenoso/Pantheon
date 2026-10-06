import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { withPrivateApiBoundary } from '../lib/private-api-boundary.mjs';
import { legacyMcpAccessHash, legacyMcpKeyAuthorized } from '../lib/legacy-machine-auth.mjs';
import { DEFAULT_RUNNER_KEY_SHA256 } from '../lib/durable-runner.mjs';
import { PROJECTION_SERVICE_TRUST as trust, verifyProjectionServiceToken } from '../../nexo-one/server/auth/vercel-oidc.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const now = Math.floor(Date.now() / 1000);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'synthetic-atlas-service', alg: 'RS256' };
const claims = {
  iss: `https://oidc.vercel.com/${trust.ownerSlug}`, aud: `https://vercel.com/${trust.ownerSlug}`,
  sub: `owner:${trust.ownerSlug}:project:${trust.projectName}:environment:${trust.environment}`,
  owner: trust.ownerSlug, owner_id: trust.ownerId, project: trust.projectName, project_id: trust.projectId,
  environment: trust.environment, iat: now - 10, exp: now + 600,
};
function token(changes = {}, key = privateKey) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ ...claims, ...changes })}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
}
function response() {
  return { statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; } };
}
const jwks = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const verifyOidc = value => verifyProjectionServiceToken(value, { fetcher: jwks });

test('MCP preserves existing dedicated/runner/scheduled-key precedence without expanding route grants', async () => {
  assert.equal(legacyMcpAccessHash({}), DEFAULT_RUNNER_KEY_SHA256);
  assert.equal(legacyMcpAccessHash({ NEXO_RUNNER_KEY_SHA256: hash('runner') }), hash('runner'));
  const env = { NEXO_MCP_ACCESS_KEY_SHA256: hash('mcp'), NEXO_RUNNER_KEY_SHA256: hash('runner') };
  assert.equal(legacyMcpKeyAuthorized({ authorization: 'Bearer mcp' }, env), true);
  assert.equal(legacyMcpKeyAuthorized({ authorization: 'Bearer runner' }, env), false);
  assert.equal(legacyMcpKeyAuthorized({ authorization: 'Bearer runner' }, { NEXO_RUNNER_KEY_SHA256: hash('runner') }), true);
  assert.equal(legacyMcpKeyAuthorized({ authorization: 'Bearer mcp' }, { NEXO_MCP_ACCESS_KEY_SHA256: 'invalid' }), false);
  let calls = 0;
  const operation = (_req, res) => { calls++; res.setHeader('Cache-Control', 'public, max-age=3600'); res.end('{"ok":true}'); };
  const allowed = withPrivateApiBoundary(operation, { machine: 'mcp', env });
  const accepted = response();
  await allowed({ method: 'POST', headers: { authorization: 'Bearer mcp' } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.headers['cache-control'], 'private, no-store');
  assert.equal(calls, 1);
  for (const policy of [null, 'projection-oidc']) {
    const denied = response();
    await withPrivateApiBoundary(operation, { machine: policy, env, verifyOidc })({ headers: { authorization: 'Bearer mcp' } }, denied);
    assert.equal(denied.statusCode, policy ? 401 : 410);
  }
  assert.equal(calls, 1);
});

test('OIDC reader gates verify exact project/audience/signature/expiry and never use server env to authenticate', async () => {
  let reads = 0;
  const valid = token();
  const handler = withPrivateApiBoundary((req, res) => {
    reads++;
    assert.equal(req.headers['x-vercel-oidc-token'], valid);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.end('{"private":true}');
  }, { machine: 'projection-oidc', env: { VERCEL_OIDC_TOKEN: valid }, verifyOidc });
  for (const headers of [{ authorization: `Bearer ${valid}` }, { 'x-vercel-oidc-token': valid }]) {
    const res = response(); await handler({ headers }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.headers['cache-control'], 'private, no-store');
  }
  const before = reads;
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const invalid = [
    token({ aud: 'https://vercel.com/another-team' }), token({ project_id: 'prj_other' }),
    token({ project: 'other-project' }), token({ environment: 'preview' }),
    token({ exp: now - 120, iat: now - 600 }), token({ iss: 'https://attacker.invalid' }),
    token({}, wrongKey), 'not-a-token',
  ];
  for (const candidate of invalid) {
    const res = response(); await handler({ headers: { 'x-vercel-oidc-token': candidate } }, res);
    assert.equal(res.statusCode, 401);
  }
  for (const headers of [{}, { cookie: 'nexo_atlas_session=old' },
    { 'x-vercel-oidc-token': valid, authorization: 'Bearer conflicting-token' }]) {
    const res = response(); await handler({ headers }, res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(reads, before, 'even a warm reader must reauthorize each caller');
  const mcpRes = response();
  await withPrivateApiBoundary(() => { throw new Error('wrong route grant'); }, { machine: 'mcp', env: { NEXO_MCP_ACCESS_KEY_SHA256: hash('mcp') } })({ headers: { authorization: `Bearer ${valid}` } }, mcpRes);
  assert.equal(mcpRes.statusCode, 401);
});

test('all four existing OIDC entrypoints accept the exact production service and reject anonymous warm-cache reads', async () => {
  const priorFetch = globalThis.fetch;
  const valid = token();
  const privateReads = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/.well-known/jwks')) return jwks();
    privateReads.push({ url: String(url), authorization: options.headers?.Authorization });
    assert.equal(options.headers?.Authorization, `Bearer ${valid}`);
    if (String(url).endsWith('/api/projections')) return { ok: true, json: async () => ({ contract: 'ProjectionEnvelope/v1', bus: 'Pantheon/UniversalProjectionBus', fingerprint: 'fixture', envelopes: [] }) };
    return { ok: true, headers: { get: () => '0-0/0' }, json: async () => [], text: async () => '' };
  };
  try {
    const cases = [
      ['runtime.js', '/api/runtime?route=state'],
      ['runtime-v2.js', '/api/runtime-v2?route=ops'],
      ['runtime-semantic.js', '/api/runtime-semantic?route=health'],
      ['universal-projection.js', '/api/universal-projection'],
    ];
    for (const [file, url] of cases) {
      const { default: handler } = await import(new URL(`../api/${file}`, import.meta.url));
      const res = response();
      await handler({ method: 'GET', url, headers: { 'x-vercel-oidc-token': valid } }, res);
      assert.equal(res.statusCode, 200, file);
      assert.equal(res.headers['cache-control'], 'private, no-store', file);
      const count = privateReads.length;
      const denied = response();
      await handler({ method: 'GET', url, headers: {} }, denied);
      assert.equal(denied.statusCode, 401, file);
      assert.equal(privateReads.length, count, file);
    }
    assert.ok(privateReads.length > 0);
  } finally { globalThis.fetch = priorFetch; }
});

test('machine policies are explicit at exactly the pre-existing entrypoints', async () => {
  for (const name of ['runtime.js', 'runtime-v2.js', 'runtime-semantic.js', 'universal-projection.js']) {
    assert.match(await readFile(new URL(`../api/${name}`, import.meta.url), 'utf8'), /machine: 'projection-oidc'/);
  }
  assert.match(await readFile(new URL('../api/mcp.js', import.meta.url), 'utf8'), /machine: 'mcp'/);
  for (const name of ['projection.js', 'runtime-drive.js', 'runtime-github.js', 'runtime-orphans.js', 'science.js', 'runner.js', 'observatory-questions.js']) {
    assert.doesNotMatch(await readFile(new URL(`../api/${name}`, import.meta.url), 'utf8'), /machine:/);
  }
});


test('actual active MCP entrypoint preserves machine discovery with no browser PIN or external reads', async () => {
  const priorMode = process.env.NEXO_STORAGE_MODE;
  const priorHash = process.env.NEXO_MCP_ACCESS_KEY_SHA256;
  const priorFetch = globalThis.fetch;
  process.env.NEXO_STORAGE_MODE = 'DRIVE_PRIMARY';
  process.env.NEXO_MCP_ACCESS_KEY_SHA256 = hash('actual-mcp-fixture-key');
  globalThis.fetch = async () => { throw new Error('Unexpected external access'); };
  try {
    const { default: handler } = await import(new URL('../api/mcp.js?machine-boundary-test', import.meta.url));
    const success = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer actual-mcp-fixture-key' } }, success);
    assert.equal(success.statusCode, 200);
    assert.equal(JSON.parse(success.body).server, 'nexo-capability-bootstrap');
    const denied = response();
    await handler({ method: 'GET', headers: {} }, denied);
    assert.equal(denied.statusCode, 401);
  } finally {
    if (priorMode === undefined) delete process.env.NEXO_STORAGE_MODE; else process.env.NEXO_STORAGE_MODE = priorMode;
    if (priorHash === undefined) delete process.env.NEXO_MCP_ACCESS_KEY_SHA256; else process.env.NEXO_MCP_ACCESS_KEY_SHA256 = priorHash;
    globalThis.fetch = priorFetch;
  }
});

test('internal proxy preserves explicitly presented machine credentials on its existing route', async () => {
  const { proxyInternal } = await import('../api/private/_proxy.mjs');
  const priorFetch = globalThis.fetch;
  let observed;
  globalThis.fetch = async (url, options) => { observed = { url: String(url), headers: options.headers }; return { status: 200, json: async () => ({ synthetic: true }) }; };
  try {
    const valid = token();
    const result = await proxyInternal({ url: '/api/private/research?focus=system%3ASCIENCE', headers: { host: 'atlas.example', 'x-vercel-oidc-token': valid } }, '/api/graph');
    assert.equal(observed.headers['x-vercel-oidc-token'], valid);
    assert.equal(observed.url, 'https://atlas.example/api/graph?focus=system%3ASCIENCE');
    assert.deepEqual(result, { status: 200, body: { synthetic: true } });
  } finally { globalThis.fetch = priorFetch; }
});
