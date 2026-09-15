import test from 'node:test';
import assert from 'node:assert/strict';

import {runVercelFallbackShard} from '../server/executor/vercel-sandbox.mjs';

const validJob = {
  runId: 'RUN-AAS77733-R1',
  workId: 'WORK-G08-0001',
  gateId: 'G08',
  shardId: '0001',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  runner: 'science/aas77733/run_shard.py',
  contractBase64: Buffer.from('{"seed_start":0,"seed_end":499}').toString('base64'),
};

test('fails closed when Vercel authentication is unavailable', async () => {
  await assert.rejects(
    runVercelFallbackShard({job: validJob, env: {}, fetchImpl: async () => assert.fail('must not call fetch')}),
    /VERCEL_AUTH_UNAVAILABLE/,
  );
});

test('rejects arbitrary repositories and unsafe runner paths before allocating compute', async () => {
  await assert.rejects(
    runVercelFallbackShard({
      job: {...validJob, repositoryUrl: 'https://github.com/evil/repo.git'},
      env: {VERCEL_OIDC_TOKEN: 'oidc'},
      fetchImpl: async () => assert.fail('must not call fetch'),
    }),
    /UNSUPPORTED_FALLBACK_REPOSITORY/,
  );
  await assert.rejects(
    runVercelFallbackShard({
      job: {...validJob, runner: '../../bin/sh'},
      env: {VERCEL_OIDC_TOKEN: 'oidc'},
      fetchImpl: async () => assert.fail('must not call fetch'),
    }),
    /UNSAFE_FALLBACK_RUNNER/,
  );
});

test('creates a bounded Python sandbox from the exact Pantheon commit and runs the frozen shard contract', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (String(url).includes('/v3/sandboxes?')) {
      return new Response(JSON.stringify({
        sandbox: {name: 'nexo-fallback-run-aas77733-r1-0001'},
        session: {id: 'sbx_123', status: 'running'},
      }), {status: 200, headers: {'content-type': 'application/json'}});
    }
    if (String(url).includes('/v2/sandboxes/sessions/sbx_123/cmd?')) {
      return new Response(JSON.stringify({
        command: {id: 'cmd_123', exitCode: '0', durationMs: '1500'},
        stdout: '{"validation_status":"PASS","result_hash":"abc123"}\n',
      }), {status: 200, headers: {'content-type': 'application/json'}});
    }
    return new Response('not found', {status: 404});
  };

  const result = await runVercelFallbackShard({
    job: validJob,
    env: {
      VERCEL_OIDC_TOKEN: 'oidc-token',
      VERCEL_TEAM_ID: 'team_TLkDXqQIHke6IumXh3qzMDcs',
      VERCEL_PROJECT_ID: 'prj_rFoAEgGt4gFNr8DHEOzxY7keS16W',
    },
    fetchImpl,
  });

  assert.equal(result.backend, 'vercel_sandbox');
  assert.equal(result.sessionRef, 'sbx_123');
  assert.equal(result.exitCode, 0);
  assert.equal(result.validationStatus, 'PASS');
  assert.equal(result.resultHash, 'abc123');
  assert.equal(calls.length, 2);

  const create = JSON.parse(calls[0].options.body);
  assert.equal(create.projectId, 'prj_rFoAEgGt4gFNr8DHEOzxY7keS16W');
  assert.equal(create.runtime, 'python3.13');
  assert.equal(create.timeout, '1800000');
  assert.deepEqual(create.resources, {vcpus: '2', memory: '4096'});
  assert.equal(create.source.url, 'https://github.com/byDenoso/Pantheon.git');
  assert.equal(create.source.revision, validJob.commitSha);
  assert.equal(create.persistent, false);

  const command = JSON.parse(calls[1].options.body);
  assert.equal(command.command, 'python3');
  assert.deepEqual(command.args, [validJob.runner, '--contract-b64', validJob.contractBase64]);
  assert.equal(command.wait, true);
  assert.equal(command.timeout, '1700000');
});

test('scientific/code failure is returned as failure and is not disguised as infrastructure fallback success', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) {
      return new Response(JSON.stringify({session: {id: 'sbx_fail'}}), {status: 200, headers: {'content-type': 'application/json'}});
    }
    return new Response(JSON.stringify({command: {id: 'cmd_fail', exitCode: '2', durationMs: '50'}, stderr: 'ASSERTION_FAILED'}), {
      status: 200,
      headers: {'content-type': 'application/json'},
    });
  };

  const result = await runVercelFallbackShard({
    job: validJob,
    env: {VERCEL_OIDC_TOKEN: 'oidc', VERCEL_TEAM_ID: 'team_x', VERCEL_PROJECT_ID: 'prj_x'},
    fetchImpl,
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.exitCode, 2);
  assert.equal(result.validationStatus, 'FAIL');
});
