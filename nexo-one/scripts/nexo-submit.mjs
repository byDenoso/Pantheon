#!/usr/bin/env node
// Provider-agnostic durable submit for NEXO result envelopes.
//
// The scheduled ChatGPT agents persist through the GitHub Contents connector. When that
// surface refuses (as it did for executor-batch-a16f378b7263cb04 on 2026-09-27), the
// envelope survives only as conversation text and the result is lost. The connector-free
// gateway at /api/inbox-drop already exists for exactly this case; this is its client, so
// any executor -- a ChatGPT task, Claude, or a local agent -- can reach the canonical
// inbox with nothing but HTTP.
//
//   node scripts/nexo-submit.mjs --file batch.json [--id <stable-id>] [--base <url>] [--dry-run]
//   node scripts/nexo-submit.mjs --check <stable-id>
//
// Idempotency: the canonical inbox is keyed by stable_id. --check (and the default
// preflight) asks the public repo whether the id already landed, so a retry after an
// ambiguous failure cannot duplicate a result.

export const GATEWAY_BASE = 'https://nexo-one-two.vercel.app';
export const MAX_PARTS = 40;
export const MAX_CHUNK = 6000;
const INBOX = 'https://api.github.com/repos/byDenoso/TCC/contents/inbox';

export const b64url = buffer => Buffer.from(buffer).toString('base64')
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

/** The gateway accepts ids matching [a-z0-9-]; normalise rather than fail late at the edge. */
export const normaliseId = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 64);

/** Split so that every encoded part stays within MAX_CHUNK, never the raw bytes. */
export function chunkEnvelope(json, maxChunk = MAX_CHUNK) {
  const bytes = Buffer.from(json, 'utf8');
  const raw = Math.floor(maxChunk / 4) * 3; // base64 expands 3 bytes -> 4 chars
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += raw) parts.push(b64url(bytes.subarray(offset, offset + raw)));
  if (!parts.length) parts.push('');
  return parts;
}

export function planSubmission(id, json, { maxChunk = MAX_CHUNK, maxParts = MAX_PARTS } = {}) {
  const stableId = normaliseId(id);
  if (!stableId) throw new Error('SUBMIT_ID_INVALID: need an id matching [a-z0-9-]');
  const parts = chunkEnvelope(json, maxChunk);
  if (parts.length > maxParts) {
    throw new Error(`SUBMIT_TOO_LARGE: ${parts.length} parts exceeds the gateway limit of ${maxParts}`);
  }
  return parts.map((d, index) => ({ id: stableId, i: index + 1, n: parts.length, d }));
}

export const dropUrl = (base, part) =>
  `${String(base).replace(/\/+$/, '')}/api/inbox-drop?id=${part.id}&i=${part.i}&n=${part.n}&d=${encodeURIComponent(part.d)}`;

/** Already-landed ids are a success, not a retry: the inbox is keyed by stable_id. */
export async function alreadyLanded(stableId, fetchImpl = fetch) {
  for (const name of [`scheduled-${stableId}.json`, `${stableId}.json`]) {
    const response = await fetchImpl(`${INBOX}/${name}?ref=nexo-inbox`, { headers: { Accept: 'application/vnd.github+json' } });
    if (response.ok) return name;
  }
  return null;
}

export async function submit(stableId, json, { base = GATEWAY_BASE, fetchImpl = fetch, log = () => {} } = {}) {
  const landed = await alreadyLanded(stableId, fetchImpl);
  if (landed) return { ok: true, status: 'ALREADY_PERSISTED', file: landed, parts: 0 };
  const plan = planSubmission(stableId, json);
  let last = null;
  for (const part of plan) {
    const response = await fetchImpl(dropUrl(base, part));
    const body = await response.json().catch(() => ({}));
    log(`part ${part.i}/${part.n} -> HTTP ${response.status} ${JSON.stringify(body).slice(0, 120)}`);
    if (!response.ok) return { ok: false, status: 'GATEWAY_REFUSED', httpStatus: response.status, body, part: part.i };
    last = body;
  }
  return { ok: true, status: 'SUBMITTED', parts: plan.length, gateway: last };
}

const isMain = String(process.argv[1] || '').endsWith('nexo-submit.mjs');

async function main(argv) {
  const flag = name => { const at = argv.indexOf(name); return at === -1 ? null : argv[at + 1]; };

  const check = flag('--check');
  if (check) {
    const landed = await alreadyLanded(normaliseId(check));
    console.log(landed ? `PERSISTED inbox/${landed}` : `ABSENT ${check} is not in the canonical inbox`);
    return landed ? 0 : 1;
  }

  const file = flag('--file');
  if (!file) {
    console.error('usage: nexo-submit.mjs --file <envelope.json> [--id <stable-id>] [--base <url>] [--dry-run]');
    console.error('       nexo-submit.mjs --check <stable-id>');
    return 2;
  }

  const { readFile } = await import('node:fs/promises');
  const json = await readFile(file, 'utf8');
  let id = normaliseId(flag('--id') || '');
  if (!id) { try { id = normaliseId(JSON.parse(json).stable_id || ''); } catch { id = ''; } }
  if (!id) { console.error('SUBMIT_ID_INVALID: pass --id or include stable_id in the envelope'); return 2; }

  if (argv.includes('--dry-run')) {
    const plan = planSubmission(id, json);
    console.log(`${id}: ${plan.length} part(s) for ${json.length} bytes; nothing sent`);
    return 0;
  }

  const result = await submit(id, json, { base: flag('--base') || GATEWAY_BASE, log: line => console.log(line) });
  console.log(JSON.stringify(result, null, 1));
  return result.ok ? 0 : 1;
}

// process.exit() while fetch sockets are still closing aborts the runtime on Windows.
if (isMain) process.exitCode = await main(process.argv.slice(2));
