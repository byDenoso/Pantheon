// NEXO inbox gateway: a connector-free write path for ChatGPT scheduled tasks.
// The GPT only needs to OPEN a URL (its read/browse tool), never a write connector:
//   GET /api/inbox-drop?id=<run-id>&i=<part>&n=<parts>&d=<base64url chunk of the JSON envelope>
// Parts are parked in byDenoso/TCC@nexo-inbox inbox/_parts/<id>/; when all n arrived the envelope is
// assembled, validated and written to inbox/ where the Writer (Guardião) applies it like any proposal.
// Gate actions (APPROVE_CHARTER, CANONIZE, ...) are refused here: they are born only in a conversation with Dener.
const REPO = 'byDenoso/TCC', BRANCH = 'nexo-inbox', API = 'https://api.github.com';
const GATE = new Set(['APPROVE_CHARTER', 'REJECT_CHARTER', 'CANONIZE', 'REJECT_CANARY']);
const MAX_PARTS = 40, MAX_CHUNK = 6000;

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

export async function inboxDrop(url, env) {
  const token = env.NEXO_INBOX_TOKEN;
  if (!token) return [{ ok: false, error: 'GATEWAY_NOT_CONFIGURED', hint: 'Dener precisa definir NEXO_INBOX_TOKEN na Vercel.' }, 503];
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  const i = Number(url.searchParams.get('i') || 1), n = Number(url.searchParams.get('n') || 1);
  const chunk = String(url.searchParams.get('d') || '');
  if (!/^[a-z0-9-]{4,60}$/.test(id) || !(n >= 1 && n <= MAX_PARTS) || !(i >= 1 && i <= n)
      || !chunk || chunk.length > MAX_CHUNK || !/^[A-Za-z0-9_-]+=*$/.test(chunk)) {
    return [{ ok: false, error: 'BAD_REQUEST', expected: 'id=[a-z0-9-], i<=n<=40, d=base64url(<=6000)' }, 400];
  }
  const partPath = `inbox/_parts/${id}/${String(i).padStart(2, '0')}-of-${String(n).padStart(2, '0')}.b64`;
  const existing = await gh(token, 'GET', partPath);
  if (!existing) await gh(token, 'PUT', partPath, { message: `inbox gateway: ${id} part ${i}/${n}`, content: Buffer.from(chunk).toString('base64') });

  const listing = (await gh(token, 'GET', `inbox/_parts/${id}`)) || [];
  const parts = listing.filter(file => file.name.endsWith(`-of-${String(n).padStart(2, '0')}.b64`)).sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length < n) return [{ ok: true, id, received: parts.length, of: n, complete: false }, 202];

  const chunks = await Promise.all(parts.map(async file => Buffer.from((await gh(token, 'GET', file.path)).content, 'base64').toString('utf8')));
  let envelope;
  try { envelope = JSON.parse(b64urlDecode(chunks.join(''))); } catch { return [{ ok: false, id, error: 'INVALID_JSON_AFTER_ASSEMBLY' }, 422]; }
  if (refusesGate(envelope)) return [{ ok: false, id, error: 'GATE_ACTIONS_ONLY_IN_CONVERSATION' }, 403];
  const kind = String(envelope.kind || 'BATCH').toUpperCase().replace(/[^A-Z_]/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const target = `inbox/${stamp}-${kind}-gw-${id}.json`;
  const body = { ...envelope, _via: 'INBOX_GATEWAY' };
  await gh(token, 'PUT', target, { message: `inbox gateway: ${kind} ${id}`, content: Buffer.from(JSON.stringify(body, null, 1)).toString('base64') });
  const readback = await gh(token, 'GET', target);
  if (!readback) return [{ ok: false, id, error: 'READBACK_FAILED' }, 502];
  await Promise.all(parts.map(file => gh(token, 'DELETE', file.path, { message: `inbox gateway: assembled ${id}`, sha: file.sha }).catch(() => null)));
  return [{ ok: true, id, complete: true, saved: target, readback: 'PASS' }, 201];
}
