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
//   node scripts/nexo-submit.mjs --enqueue --file batch.json [--id <stable-id>] [--dir <spool>]
//   node scripts/nexo-submit.mjs --drain [--dir <spool>] [--dry-run]
//
// Durable spool (AUT-002/003): --enqueue writes <spool>/pending/<stable_id>.json create-only
// and appends to <spool>/journal.jsonl BEFORE any staging attempt, so a refused connector can
// no longer leave the envelope only in conversation text. --drain runs at the start of every
// round: an id already in nexo-inbox (inbox/ or processed/) or still in flight on the
// dispatch-runtime staging ref is never resubmitted; everything else goes through the gateway.
//
// Idempotency: the canonical inbox is keyed by stable_id. --check (and the default
// preflight) asks the connector-free gateway whether the id already landed, so a retry
// after an ambiguous failure cannot duplicate a result in the Sheet spool or legacy inbox.

export const GATEWAY_BASE = 'https://nexo-one-two.vercel.app';
export const MAX_PARTS = 40;
export const MAX_CHUNK = 6000;
export const DEFAULT_SPOOL = '.nexo-spool';
/** Staging written by the scheduled agents and relayed to nexo-inbox in ~8 s (public, read-only). */
export const STAGING_BASE = 'https://raw.githubusercontent.com/byDenoso/TCC/nexo/dispatch-runtime/nexo_persist/requests';

export const b64url = buffer => Buffer.from(buffer).toString('base64')
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

/** The gateway accepts ids matching [a-z0-9-]; normalise rather than fail late at the edge. */
export const normaliseId = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 60);

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
  if (stableId.length < 4) throw new Error('SUBMIT_ID_INVALID: need an id with 4-60 characters from [a-z0-9-]');
  const parts = chunkEnvelope(json, maxChunk);
  if (parts.length > maxParts) {
    throw new Error(`SUBMIT_TOO_LARGE: ${parts.length} parts exceeds the gateway limit of ${maxParts}`);
  }
  return parts.map((d, index) => ({ id: stableId, i: index + 1, n: parts.length, d }));
}

export const dropUrl = (base, part) =>
  `${String(base).replace(/\/+$/, '')}/api/inbox-drop?id=${part.id}&i=${part.i}&n=${part.n}&d=${encodeURIComponent(part.d)}`;

/** Already-landed ids are a success, not a retry: the inbox is keyed by stable_id. */
export async function alreadyLanded(stableId, fetchImpl = fetch, base = GATEWAY_BASE) {
  const response = await fetchImpl(`${String(base).replace(/\/+$/, '')}/api/inbox-drop?id=${encodeURIComponent(stableId)}&check=1`);
  if (!response.ok) throw new Error(`INBOX_CHECK_FAILED_HTTP_${response.status}`);
  const body = await response.json().catch(() => ({}));
  return body.complete === true && body.readback === 'PASS' ? String(body.saved || stableId) : null;
}

export async function submit(stableId, json, { base = GATEWAY_BASE, fetchImpl = fetch, log = () => {} } = {}) {
  const id = normaliseId(stableId);
  if (id.length < 4) throw new Error('SUBMIT_ID_INVALID: need an id with 4-60 characters from [a-z0-9-]');
  const landed = await alreadyLanded(id, fetchImpl, base).catch(error => {
    log(`inbox preflight unavailable; trying the durable relay: ${String(error?.message || error).slice(0, 100)}`);
    return null;
  });
  if (landed) return { ok: true, status: 'ALREADY_PERSISTED', file: landed, parts: 0, complete: true, readback: 'PASS' };
  const plan = planSubmission(id, json);
  let last = null;
  for (const part of plan) {
    const response = await fetchImpl(dropUrl(base, part));
    const body = await response.json().catch(() => ({}));
    log(`part ${part.i}/${part.n} -> HTTP ${response.status} ${JSON.stringify(body).slice(0, 120)}`);
    if (!response.ok) return { ok: false, status: 'GATEWAY_REFUSED', httpStatus: response.status, body, part: part.i };
    if (body.complete === true && body.readback === 'PASS') {
      return { ok: true, status: body.reused ? 'ALREADY_PERSISTED' : 'SUBMITTED', parts: part.i, gateway: body, complete: true, readback: 'PASS' };
    }
    last = body;
  }
  if (last?.complete !== true || last?.readback !== 'PASS') {
    return { ok: false, status: 'READBACK_UNCONFIRMED', parts: plan.length, gateway: last };
  }
  return { ok: true, status: 'SUBMITTED', parts: plan.length, gateway: last, complete: true, readback: 'PASS' };
}

/** In flight on the relay: staged on dispatch-runtime but not yet visible in nexo-inbox. */
export async function stagedInRelay(stableId, fetchImpl = fetch, stagingBase = STAGING_BASE) {
  const response = await fetchImpl(`${String(stagingBase).replace(/\/+$/, '')}/${encodeURIComponent(stableId)}.json`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`STAGING_CHECK_FAILED_HTTP_${response.status}`);
  return true;
}

/** Append-only journal: one JSON line per event, never rewritten. */
export async function appendJournal(dir, record, fs) {
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(`${dir}/journal.jsonl`, JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
}

/** Create-only durable write keyed by stable_id; an existing id is kept, never overwritten. */
export async function enqueue(dir, stableId, json, fs) {
  const id = normaliseId(stableId);
  if (id.length < 4) throw new Error('SUBMIT_ID_INVALID: need an id with 4-60 characters from [a-z0-9-]');
  JSON.parse(json); // refuse to spool something that is not JSON
  await fs.mkdir(`${dir}/pending`, { recursive: true });
  try {
    await fs.writeFile(`${dir}/pending/${id}.json`, json, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await fs.readFile(`${dir}/pending/${id}.json`, 'utf8');
    if (existing !== json) throw new Error(`SPOOL_CONFLICT: ${id} is already spooled with a different envelope`);
    return { id, status: 'ALREADY_SPOOLED' };
  }
  await appendJournal(dir, { stable_id: id, event: 'ENQUEUED', bytes: Buffer.byteLength(json) }, fs);
  return { id, status: 'ENQUEUED' };
}

/**
 * Drain the spool at the start of a round. Order per id: landed in nexo-inbox → done;
 * staged on dispatch-runtime → leave for the relay; otherwise submit through the gateway.
 */
export async function drain(dir, { fs, fetchImpl = fetch, base = GATEWAY_BASE, stagingBase = STAGING_BASE, dryRun = false, log = () => {} } = {}) {
  const names = await fs.readdir(`${dir}/pending`).catch(error => { if (error?.code === 'ENOENT') return []; throw error; });
  const summary = { landed: 0, inRelay: 0, submitted: 0, failed: 0, ids: {} };
  for (const name of names.filter(entry => entry.endsWith('.json')).sort()) {
    const id = name.slice(0, -5);
    const json = await fs.readFile(`${dir}/pending/${name}`, 'utf8');
    let outcome;
    const landed = await alreadyLanded(id, fetchImpl, base).catch(() => null);
    if (landed) outcome = 'LANDED';
    else if (await stagedInRelay(id, fetchImpl, stagingBase).catch(() => false)) outcome = 'IN_RELAY';
    else if (dryRun) outcome = 'WOULD_SUBMIT';
    else {
      const result = await submit(id, json, { base, fetchImpl, log });
      outcome = result.ok ? 'SUBMITTED' : `FAILED_${result.status}`;
    }
    summary.ids[id] = outcome;
    if (outcome === 'LANDED') summary.landed += 1;
    else if (outcome === 'IN_RELAY') summary.inRelay += 1;
    else if (outcome === 'SUBMITTED') summary.submitted += 1;
    else if (outcome.startsWith('FAILED')) summary.failed += 1;
    if (dryRun) continue;
    await appendJournal(dir, { stable_id: id, event: outcome }, fs);
    if (outcome === 'LANDED' || outcome === 'SUBMITTED') {
      await fs.mkdir(`${dir}/done`, { recursive: true });
      await fs.rename(`${dir}/pending/${name}`, `${dir}/done/${name}`);
    }
  }
  return summary;
}

const isMain = String(process.argv[1] || '').endsWith('nexo-submit.mjs');

async function main(argv) {
  const flag = name => { const at = argv.indexOf(name); return at === -1 ? null : argv[at + 1]; };

  const check = flag('--check');
  if (check) {
    const stableId = normaliseId(check);
    if (stableId.length < 4) { console.error('SUBMIT_ID_INVALID: need an id with 4-60 characters from [a-z0-9-]'); return 2; }
    let landed;
    try { landed = await alreadyLanded(stableId, fetch, flag('--base') || GATEWAY_BASE); }
    catch { console.error(`CHECK_UNAVAILABLE: could not verify ${stableId} in the canonical inbox`); return 2; }
    console.log(landed ? `PERSISTED inbox/${landed}` : `ABSENT ${check} is not in the canonical inbox`);
    return landed ? 0 : 1;
  }

  const dir = flag('--dir') || DEFAULT_SPOOL;
  if (argv.includes('--drain')) {
    const fs = await import('node:fs/promises');
    const summary = await drain(dir, { fs, base: flag('--base') || GATEWAY_BASE, dryRun: argv.includes('--dry-run'), log: line => console.log(line) });
    console.log(JSON.stringify(summary, null, 1));
    return summary.failed ? 1 : 0;
  }

  const file = flag('--file');
  if (file && argv.includes('--enqueue')) {
    const fs = await import('node:fs/promises');
    const json = await fs.readFile(file, 'utf8');
    let id = normaliseId(flag('--id') || '');
    if (!id) { try { id = normaliseId(JSON.parse(json).stable_id || ''); } catch { id = ''; } }
    const result = await enqueue(dir, id, json, fs);
    console.log(JSON.stringify(result));
    return 0;
  }
  if (!file) {
    console.error('usage: nexo-submit.mjs --file <envelope.json> [--id <stable-id>] [--base <url>] [--dry-run]');
    console.error('       nexo-submit.mjs --check <stable-id>');
    console.error('       nexo-submit.mjs --enqueue --file <envelope.json> [--id <stable-id>] [--dir <spool>]');
    console.error('       nexo-submit.mjs --drain [--dir <spool>] [--dry-run]');
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
