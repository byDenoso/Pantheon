const DEFAULT_TEAM_ID = 'team_TLkDXqQIHke6IumXh3qzMDcs';
const DEFAULT_PROJECT_ID = 'prj_rFoAEgGt4gFNr8DHEOzxY7keS16W';
const ALLOWED_REPOSITORY = 'https://github.com/byDenoso/Pantheon.git';
const SHA40 = /^[0-9a-f]{40}$/i;
const SAFE_RUNNER = /^science\/[A-Za-z0-9_.\/-]+\.py$/;

function fail(code) {
  throw new Error(code);
}

async function readJson(response, code) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(code);
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || response.status;
    throw new Error(`${code}:${detail}`);
  }
  return payload;
}

function safeName(job) {
  const raw = `nexo-fallback-${job.runId}-${job.shardId}`.toLowerCase();
  return raw.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 63) || 'nexo-fallback';
}

function parseResult(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Ignore diagnostic output and keep scanning for the structured receipt.
    }
  }
  return {};
}

function validateJob(job) {
  if (!job || typeof job !== 'object') fail('INVALID_FALLBACK_JOB');
  const repositoryUrl = job.repositoryUrl || ALLOWED_REPOSITORY;
  if (repositoryUrl !== ALLOWED_REPOSITORY) fail('UNSUPPORTED_FALLBACK_REPOSITORY');
  if (!SHA40.test(String(job.commitSha || ''))) fail('INVALID_FALLBACK_COMMIT');
  const runner = String(job.runner || '');
  if (!SAFE_RUNNER.test(runner) || runner.includes('..') || runner.includes('\\')) fail('UNSAFE_FALLBACK_RUNNER');
  if (!String(job.contractBase64 || '').trim()) fail('FALLBACK_CONTRACT_REQUIRED');
  for (const key of ['runId', 'workId', 'gateId', 'shardId']) {
    if (!String(job[key] || '').trim()) fail(`FALLBACK_${key.toUpperCase()}_REQUIRED`);
  }
  return {...job, repositoryUrl, runner};
}

export async function runVercelFallbackShard({job, env = process.env, fetchImpl = fetch} = {}) {
  const frozen = validateJob(job);
  const token = env.VERCEL_OIDC_TOKEN || env.VERCEL_TOKEN;
  if (!token) fail('VERCEL_AUTH_UNAVAILABLE');

  const teamId = env.VERCEL_TEAM_ID || DEFAULT_TEAM_ID;
  const projectId = env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const createUrl = `https://api.vercel.com/v3/sandboxes?teamId=${encodeURIComponent(teamId)}`;
  const createBody = {
    name: safeName(frozen),
    projectId,
    runtime: 'python3.13',
    resources: {vcpus: '2', memory: '4096'},
    source: {
      type: 'git',
      url: frozen.repositoryUrl,
      depth: '1',
      revision: frozen.commitSha,
    },
    timeout: '1800000',
    persistent: false,
    networkPolicy: {mode: 'allow-all'},
    tags: {
      run_id: frozen.runId,
      work_id: frozen.workId,
      gate_id: frozen.gateId,
      shard_id: frozen.shardId,
      executor: 'vercel_fallback',
    },
  };

  const created = await readJson(await fetchImpl(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(createBody),
  }), 'VERCEL_SANDBOX_CREATE_FAILED');

  const sessionId = created?.session?.id || created?.data?.session?.id || created?.id;
  if (!sessionId || !String(sessionId).startsWith('sbx_')) fail('VERCEL_SANDBOX_SESSION_MISSING');

  const commandUrl = `https://api.vercel.com/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/cmd?teamId=${encodeURIComponent(teamId)}`;
  const commandBody = {
    command: 'python3',
    args: [frozen.runner, '--contract-b64', frozen.contractBase64],
    wait: true,
    logs: true,
    timeout: '1700000',
  };
  const executed = await readJson(await fetchImpl(commandUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(commandBody),
  }), 'VERCEL_SANDBOX_COMMAND_FAILED');

  const command = executed?.command || {};
  const exitCode = Number(command.exitCode ?? executed?.exitCode ?? 1);
  const structured = parseResult(executed?.stdout ?? command?.stdout);
  const validationStatus = String(structured.validation_status || (exitCode === 0 ? 'PASS' : 'FAIL')).toUpperCase();
  const success = exitCode === 0 && validationStatus === 'PASS';

  return {
    status: success ? 'COMPLETE' : 'FAILED',
    backend: 'vercel_sandbox',
    sessionRef: String(sessionId),
    commandRef: command.id || null,
    runId: frozen.runId,
    workId: frozen.workId,
    gateId: frozen.gateId,
    shardId: frozen.shardId,
    commitSha: frozen.commitSha,
    exitCode,
    validationStatus,
    resultHash: structured.result_hash || null,
    durationMs: Number(command.durationMs || 0),
  };
}
