// NEXO inbox gateway: a connector-free write path for ChatGPT tasks, and the robot's window on the inbox.
//
//  drop  GET /api/inbox-drop?id=<run-id>&i=<part>&n=<parts>&d=<base64url chunk of the JSON envelope>
//        The GPT only OPENS this URL. Parts wait in byDenoso/TCC@nexo-inbox inbox/_parts/<id>/; when all n
//        arrived the envelope is assembled, validated and written to inbox/ (read back before answering).
//  list  GET /api/inbox-list        -> every proposal in inbox/*.json         (robot only)
//  ack   GET /api/inbox-ack?ids=a,b -> moves those files to processed/        (robot only)
//        "Robot only" = a GitHub Actions OIDC token from byDenoso/Pantheon's NEXO Writer robot workflow,
//        verified against GitHub's public keys: the robot holds no GitHub secret at all.
// The GitHub credential lives only here (Vercel env NEXO_INBOX_TOKEN, Contents RW on byDenoso/TCC).
// Gate actions (APPROVE_CHARTER, CANONIZE, ...) are refused: they are born only in a conversation with Dener.
import { createPublicKey, createVerify } from 'node:crypto';

const REPO = 'byDenoso/TCC', BRANCH = 'nexo-inbox', API = 'https://api.github.com';
const GATE = new Set(['APPROVE_CHARTER', 'REJECT_CHARTER', 'CANONIZE', 'REJECT_CANARY']);
const MAX_PARTS = 40, MAX_CHUNK = 6000;
const ROBOT_REPO = 'byDenoso/Pantheon', ROBOT_WORKFLOW = '.github/workflows/nexo-writer-robot.yml', AUDIENCE = 'nexo-inbox';

const b64urlDecode = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

async function gh(token, method, path, body) {
  const response = await fetch(`${API}/repos/${REPO}/contents/${path}${method === 'GET' ? `?ref=${BRANCH}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'nexo-inbox-gateway' },
    body: body ? JSON.stringify({ branch: BRANCH, ...body }) : undefined,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GITHUB_${response.status}`);
  return response.json();
}

function refusesGate(envelope) {
  const items = envelope?.kind === 'BATCH' ? envelope?.payload?.items || [] : [envelope];
  return items.some(item => String(item?.kind || '').toUpperCase() === 'OPERATOR_INTENT'
    && GATE.has(String(item?.payload?.action || '').toUpperCase()));
}

const notConfigured = [{ ok: false, error: 'GATEWAY_NOT_CONFIGURED', hint: 'NEXO_INBOX_TOKEN ausente na Vercel.' }, 503];

export async function inboxDrop(url, env) {
  const token = env.NEXO_INBOX_TOKEN;
  if (!token) return notConfigured;
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  const i = Number(url.searchParams.get('i') || 1), n = Number(url.searchParams.get('n') || 1);
  const chunk = String(url.searchParams.get('d') || '');
  if (!/^[a-z0-9-]{4,60}$/.test(id) || !(n >= 1 && n <= MAX_PARTS) || !(i >= 1 && i <= n)
      || !chunk || chunk.length > MAX_CHUNK || !/^[A-Za-z0-9_-]+=*$/.test(chunk)) {
    return [{ ok: false, error: 'BAD_REQUEST', expected: 'id=[a-z0-9-], i<=n<=40, d=base64url(<=6000)' }, 400];
  }
  const pad = v => String(v).padStart(2, '0');
  const partPath = `inbox/_parts/${id}/${pad(i)}-of-${pad(n)}.b64`;
  if (!(await gh(token, 'GET', partPath))) {
    await gh(token, 'PUT', partPath, { message: `inbox gateway: ${id} part ${i}/${n}`, content: Buffer.from(chunk).toString('base64') });
  }
  const listing = (await gh(token, 'GET', `inbox/_parts/${id}`)) || [];
  const parts = listing.filter(f => f.name.endsWith(`-of-${pad(n)}.b64`)).sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length < n) return [{ ok: true, id, received: parts.length, of: n, complete: false }, 202];

  const chunks = await Promise.all(parts.map(async f => Buffer.from((await gh(token, 'GET', f.path)).content, 'base64').toString('utf8')));
  let envelope;
  try { envelope = JSON.parse(b64urlDecode(chunks.join(''))); } catch { return [{ ok: false, id, error: 'INVALID_JSON_AFTER_ASSEMBLY' }, 422]; }
  if (refusesGate(envelope)) return [{ ok: false, id, error: 'GATE_ACTIONS_ONLY_IN_CONVERSATION' }, 403];
  const kind = String(envelope.kind || 'BATCH').toUpperCase().replace(/[^A-Z_]/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const target = `inbox/${stamp}-${kind}-gw-${id}.json`;
  await gh(token, 'PUT', target, { message: `inbox gateway: ${kind} ${id}`, content: Buffer.from(JSON.stringify({ ...envelope, _via: 'INBOX_GATEWAY' }, null, 1)).toString('base64') });
  if (!(await gh(token, 'GET', target))) return [{ ok: false, id, error: 'READBACK_FAILED' }, 502];
  await Promise.all(parts.map(f => gh(token, 'DELETE', f.path, { message: `inbox gateway: assembled ${id}`, sha: f.sha }).catch(() => null)));
  return [{ ok: true, id, complete: true, saved: target, readback: 'PASS' }, 201];
}

// ── GitHub Actions OIDC (robot identity, no shared secret) ──────────────────
let jwksCache = null;
async function githubKey(kid) {
  if (!jwksCache || jwksCache.until < Date.now()) {
    const jwks = await (await fetch('https://token.actions.githubusercontent.com/.well-known/jwks')).json();
    jwksCache = { keys: jwks.keys || [], until: Date.now() + 3600e3 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid);
  return jwk ? createPublicKey({ key: jwk, format: 'jwk' }) : null;
}

async function isRobot(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const header = JSON.parse(b64urlDecode(h)), claims = JSON.parse(b64urlDecode(p));
  const key = header.alg === 'RS256' ? await githubKey(header.kid) : null;
  if (!key) return false;
  const verified = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  return verified && claims.iss === 'https://token.actions.githubusercontent.com' && claims.aud === AUDIENCE
    && claims.exp > Date.now() / 1000 && claims.repository === ROBOT_REPO && String(claims.workflow_ref || '').includes(ROBOT_WORKFLOW);
}

export async function inboxRobot(route, url, req, env) {
  if (!(await isRobot(req).catch(() => false))) return [{ ok: false, error: 'ROBOT_ONLY' }, 403];
  const token = env.NEXO_INBOX_TOKEN;
  if (!token) return notConfigured;
  const files = ((await gh(token, 'GET', 'inbox')) || []).filter(f => f.type === 'file' && f.name.endsWith('.json'));
  if (route === 'inbox-list') {
    const items = [];
    for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const blob = await gh(token, 'GET', f.path);
        const envelope = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8').replace(/^﻿/, ''));
        if (envelope && typeof envelope === 'object' && !refusesGate(envelope)) items.push({ id: f.name.replace(/\.json$/, ''), envelope });
      } catch { /* unreadable file stays in inbox/ */ }
    }
    return [{ ok: true, items }, 200];
  }
  const ids = new Set(String(url.searchParams.get('ids') || '').split(',').filter(Boolean));
  const moved = [];
  for (const f of files.filter(f => ids.has(f.name.replace(/\.json$/, '')))) {
    const blob = await gh(token, 'GET', f.path);
    await gh(token, 'PUT', `processed/${f.name}`, { message: `writer robot: processed ${f.name}`, content: blob.content.replace(/\s/g, '') }).catch(() => null);
    await gh(token, 'DELETE', f.path, { message: `writer robot: applied ${f.name}`, sha: blob.sha });
    moved.push(f.name);
  }
  return [{ ok: true, moved }, 200];
}
