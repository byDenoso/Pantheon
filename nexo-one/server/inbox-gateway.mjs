// NEXO inbox gateway: a connector-free, secret-free write path for ChatGPT scheduled tasks.
//
//  drop  GET /api/inbox-drop?id=<run-id>&i=<part>&n=<parts>&d=<base64url chunk of the JSON envelope>
//        The GPT only OPENS this URL (read/browse tool). Each part becomes one row in the "nexo_inbox" tab of
//        the NEXO sheet, written with the Google access the ATLAS already has (Vercel Connect, sheets scope).
//  list  GET /api/inbox-list   -> complete, not-yet-applied envelopes      (robot only)
//  ack   GET /api/inbox-ack?ids=a,b -> marks those envelopes as applied    (robot only)
//        "Robot only" = a GitHub Actions OIDC token from byDenoso/Pantheon's NEXO Writer robot workflow,
//        verified against GitHub's public keys: no shared secret exists anywhere.
// Gate actions (APPROVE_CHARTER, CANONIZE, ...) are refused: they are born only in a conversation with Dener.
import { createPublicKey, createVerify } from 'node:crypto';
import { googleToken } from './adapters/google.mjs';
import { GOOGLE_WRITE_SCOPES } from './adapters/connect.mjs';

const TAB = 'nexo_inbox', SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const GATE = new Set(['APPROVE_CHARTER', 'REJECT_CHARTER', 'CANONIZE', 'REJECT_CANARY']);
const MAX_PARTS = 40, MAX_CHUNK = 6000;
const ROBOT_REPO = 'byDenoso/Pantheon', ROBOT_WORKFLOW = '.github/workflows/nexo-writer-robot.yml', AUDIENCE = 'nexo-inbox';

const b64urlDecode = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

async function api(token, method, url, body) {
  const response = await fetch(url, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`SHEETS_${response.status}`);
  return response.json();
}

async function sheetAccess(env) {
  if (!env.NEXO_SHEET_ID) throw new Error('GATEWAY_NOT_CONFIGURED');
  const token = await googleToken(env, undefined, { scopes: GOOGLE_WRITE_SCOPES.sheets });
  const base = `${SHEETS}/${encodeURIComponent(env.NEXO_SHEET_ID)}`;
  const meta = await api(token, 'GET', `${base}?fields=sheets.properties.title`);
  if (!(meta.sheets || []).some(s => s.properties?.title === TAB)) {
    await api(token, 'POST', `${base}:batchUpdate`, { requests: [{ addSheet: { properties: { title: TAB } } }] });
    await api(token, 'PUT', `${base}/values/${TAB}!A1:F1?valueInputOption=RAW`, { values: [['at', 'id', 'i', 'n', 'data', 'applied_at']] });
  }
  return { token, base };
}

async function rows(access) {
  const data = await api(access.token, 'GET', `${access.base}/values/${TAB}!A2:F`);
  return (data.values || []).map((row, index) => ({ row: index + 2, at: row[0], id: row[1], i: Number(row[2]), n: Number(row[3]), data: row[4] || '', applied: row[5] || '' }));
}

function refusesGate(envelope) {
  const items = envelope?.kind === 'BATCH' ? envelope?.payload?.items || [] : [envelope];
  return items.some(item => String(item?.kind || '').toUpperCase() === 'OPERATOR_INTENT'
    && GATE.has(String(item?.payload?.action || '').toUpperCase()));
}

function assemble(all) {
  const byId = new Map();
  for (const r of all) (byId.get(r.id) || byId.set(r.id, []).get(r.id)).push(r);
  const out = [];
  for (const [id, parts] of byId) {
    if (parts.some(p => p.applied)) continue;
    const n = parts[0].n, unique = new Map(parts.map(p => [p.i, p]));
    if (unique.size < n) continue;
    try {
      const envelope = JSON.parse(b64urlDecode([...unique.values()].sort((a, b) => a.i - b.i).map(p => p.data).join('')));
      if (!refusesGate(envelope)) out.push({ id, at: parts[0].at, envelope: { ...envelope, _via: 'INBOX_GATEWAY' } });
    } catch { /* invalid JSON stays unapplied and visible in the sheet */ }
  }
  return out;
}

export async function inboxDrop(url, env) {
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  const i = Number(url.searchParams.get('i') || 1), n = Number(url.searchParams.get('n') || 1);
  const chunk = String(url.searchParams.get('d') || '');
  if (!/^[a-z0-9-]{4,60}$/.test(id) || !(n >= 1 && n <= MAX_PARTS) || !(i >= 1 && i <= n)
      || !chunk || chunk.length > MAX_CHUNK || !/^[A-Za-z0-9_-]+=*$/.test(chunk)) {
    return [{ ok: false, error: 'BAD_REQUEST', expected: 'id=[a-z0-9-], i<=n<=40, d=base64url(<=6000)' }, 400];
  }
  let access;
  try { access = await sheetAccess(env); } catch (error) { return [{ ok: false, error: String(error.message || error) }, 503]; }
  const before = await rows(access);
  if (!before.some(r => r.id === id && r.i === i)) {
    await api(access.token, 'POST', `${access.base}/values/${TAB}!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [[new Date().toISOString(), id, i, n, chunk, '']] });
  }
  const after = (await rows(access)).filter(r => r.id === id);
  const received = new Set(after.map(r => r.i)).size;
  if (received < n) return [{ ok: true, id, received, of: n, complete: false }, 202];
  const [done] = assemble(after);
  if (!done) return [{ ok: false, id, error: 'INVALID_JSON_OR_GATE_ACTION' }, 422];
  return [{ ok: true, id, complete: true, saved: `sheet:${TAB}/${id}`, readback: 'PASS' }, 201];
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
  const now = Date.now() / 1000;
  return verified && claims.iss === 'https://token.actions.githubusercontent.com' && claims.aud === AUDIENCE
    && claims.exp > now && claims.repository === ROBOT_REPO && String(claims.workflow_ref || '').includes(ROBOT_WORKFLOW);
}

export async function inboxRobot(route, url, req, env) {
  if (!(await isRobot(req).catch(() => false))) return [{ ok: false, error: 'ROBOT_ONLY' }, 403];
  const access = await sheetAccess(env);
  const all = await rows(access);
  if (route === 'inbox-list') return [{ ok: true, items: assemble(all) }, 200];
  const ids = new Set(String(url.searchParams.get('ids') || '').split(',').filter(Boolean));
  const stamp = new Date().toISOString();
  const data = all.filter(r => ids.has(r.id)).map(r => ({ range: `${TAB}!F${r.row}`, values: [[stamp]] }));
  if (data.length) await api(access.token, 'POST', `${access.base}/values:batchUpdate`, { valueInputOption: 'RAW', data });
  return [{ ok: true, acked: [...ids], rows: data.length }, 200];
}
