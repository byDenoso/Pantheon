import {createHash} from 'node:crypto';

const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const GATES = new Set(['APPROVE_CHARTER', 'REJECT_CHARTER', 'CANONIZE', 'REJECT_CANARY']);
const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const configured = env => Boolean(env.GOOGLE_CONNECTOR || (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN));

function refusesGate(envelope, isOperationalEnvelope) {
  if (isOperationalEnvelope(envelope)) return true;
  const stack = [envelope];
  while (stack.length) {
    const item = stack.pop();
    if (!object(item)) continue;
    const body = object(item.payload) ? item.payload : item;
    const kind = String(item.kind || body.kind || '').toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
    if (kind === 'BATCH' && Array.isArray(body.items)) stack.push(...body.items);
    if ((kind === 'OPERATOR_INTENT' || kind === 'INTENT') && GATES.has(String(body.action || '').toUpperCase())) return true;
  }
  return false;
}

function storedRows(spool, id, expected) {
  const rows = spool.rows.filter(row => String(row?.[spool.columns.stable] || '').trim() === id);
  let fingerprint = null;
  for (const row of rows) {
    let actual;
    try { actual = decode(String(row?.[spool.columns.envelope] || '')); }
    catch { throw new Error('SPOOL_IDENTITY_CONFLICT'); }
    if (!object(actual)) throw new Error('SPOOL_IDENTITY_CONFLICT');
    const hash = digest(actual);
    if ((fingerprint && hash !== fingerprint) || (expected && canonical(actual) !== canonical(expected))) {
      throw new Error('SPOOL_IDENTITY_CONFLICT');
    }
    fingerprint = hash;
  }
  return {count: rows.length, fingerprint};
}

function collectParts(spool, id, total) {
  const parts = new Map(), p = spool.partBase;
  for (const row of spool.rows) {
    if (row?.[p] !== 'GW_PART' || row?.[p + 1] !== id) continue;
    const index = Number(row[p + 2]), n = Number(row[p + 3]), chunk = row[p + 4];
    if (n !== total || !Number.isInteger(index) || index < 1 || index > total || typeof chunk !== 'string'
        || (parts.has(index) && parts.get(index) !== chunk)) throw new Error('SPOOL_PART_CONFLICT');
    parts.set(index, chunk);
  }
  return parts;
}

/** At-least-once ingress, not an execution acknowledgement. The Writer owns effect deduplication.
 * Dependencies reuse the current authenticated Sheet spool. No new credentials or storage.
 */
export function createReliableInboxDrop({readSpool, appendSpoolRow, fullSpoolRow, legacyDrop, isOperationalEnvelope, spoolId}) {
  return async function inboxDrop(url, env, req) {
    const id = String(url.searchParams.get('id') || '').toLowerCase();
    const failure = (error, status, extra = {}) => [{ok: false, id, error, ...extra}, status];
    if (!/^[a-z0-9-]{4,60}$/.test(id)) return failure('BAD_REQUEST', 400);
    const checkOnly = url.searchParams.get('check') === '1';
    if (!configured(env)) {
      if (!checkOnly) return failure('GATEWAY_NOT_CONFIGURED', 503);
      // Preserve read-only legacy lookup; existence never proves application or payload equality.
      const [value, status] = await legacyDrop(url, env, req);
      return [{...value, readback: 'UNVERIFIED', verification: 'EXISTENCE_ONLY', application_verification: 'NOT_CHECKED'}, status];
    }
    const i = Number(url.searchParams.get('i') || 1), n = Number(url.searchParams.get('n') || 1);
    const chunk = String(url.searchParams.get('d') || '');
    if (!checkOnly && (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 40 || i < 1 || i > n
        || !chunk || chunk.length > 6000 || !/^[A-Za-z0-9_-]+=*$/.test(chunk))) return failure('BAD_REQUEST', 400);
    let sending = false;
    try {
      const read = async () => {
        const spool = await readSpool(env, req);
        if (spool.spreadsheetId !== spoolId) throw new Error('SPOOL_DESTINATION_MISMATCH');
        return spool;
      };
      let spool = await read();
      if (checkOnly) {
        const saved = storedRows(spool, id);
        const expected = url.searchParams.get('body_sha256');
        if (expected && !/^[a-f0-9]{64}$/.test(expected)) return failure('BAD_REQUEST', 400);
        if (expected && saved.count && saved.fingerprint !== expected) return failure('SPOOL_IDENTITY_CONFLICT', 409);
        return [{ok: true, id, found: saved.count > 0, complete: saved.count > 0,
          stage: saved.count ? 'DELIVERED' : 'NOT_FOUND', transport: 'SHEET_SPOOL',
          readback: expected && saved.count ? 'PASS' : 'UNVERIFIED',
          verification: expected && saved.count ? 'BODY_HASH' : 'EXISTENCE_ONLY',
          body_sha256: saved.fingerprint, application_verification: 'NOT_CHECKED'}, 200];
      }
      let envelope;
      if (n === 1) {
        try { envelope = decode(chunk); }
        catch { return failure('INVALID_JSON_AFTER_ASSEMBLY', 422); }
      } else {
        let parts = collectParts(spool, id, n);
        if (parts.has(i) && parts.get(i) !== chunk) return failure('SPOOL_PART_CONFLICT', 409);
        if (!parts.has(i)) {
          const row = Array(spool.partBase + 5).fill(''), p = spool.partBase;
          row[p] = 'GW_PART'; row[p + 1] = id; row[p + 2] = String(i); row[p + 3] = String(n); row[p + 4] = chunk;
          sending = true;
          await appendSpoolRow(spool, row);
          sending = false;
        }
        spool = await read();
        parts = collectParts(spool, id, n);
        if (parts.size < n) return [{ok: true, id, received: parts.size, of: n, complete: false,
          stage: 'RECEIVING', transport: 'SHEET_SPOOL', application_verification: 'NOT_CHECKED'}, 202];
        try { envelope = decode(Array.from({length: n}, (_, index) => parts.get(index + 1)).join('')); }
        catch { return failure('INVALID_JSON_AFTER_ASSEMBLY', 422); }
      }
      if (!object(envelope)) return failure('INVALID_ENVELOPE', 422);
      if (refusesGate(envelope, isOperationalEnvelope)) return failure('GATE_ACTIONS_ONLY_IN_CONVERSATION', 403);
      const stored = {...envelope, _via: 'INBOX_GATEWAY_SHEET'};
      let saved = storedRows(spool, id, stored);
      const reused = saved.count > 0;
      if (!reused) {
        sending = true;
        await appendSpoolRow(spool, fullSpoolRow(spool, {stableId: id, envelope: stored, role: envelope.source || 'ATLAS_GATEWAY'}));
        sending = false;
        spool = await read();
        saved = storedRows(spool, id, stored);
        if (!saved.count) return failure('READBACK_FAILED', 502, {stage: 'OUTCOME_UNKNOWN', retry: 'SAME_ID_AND_PAYLOAD'});
      }
      // Do not clear shared row numbers: concurrent appends/maintenance can move them.
      // Immutable identical parts are harmless; cleanup is separate from delivery correctness.
      return [{ok: true, id, complete: true, saved: `sheet:${id}`, reused, stage: 'DELIVERED',
        readback: 'PASS', verification: 'BODY_HASH', body_sha256: saved.fingerprint,
        transport: 'SHEET_SPOOL', application_verification: 'NOT_CHECKED'}, reused ? 200 : 201];
    } catch (error) {
      const code = String(error?.message || '');
      if (['SPOOL_IDENTITY_CONFLICT', 'SPOOL_PART_CONFLICT'].includes(code)) return failure(code, 409);
      if (code === 'SPOOL_DESTINATION_MISMATCH') return failure(code, 503);
      // A thrown transport error can follow a committed append. Never retry with a new identity.
      return failure('SHEET_SPOOL_WRITE_FAILED', 502, {stage: sending ? 'OUTCOME_UNKNOWN' : 'UNVERIFIED',
        retry: 'SAME_ID_AND_PAYLOAD', github_token_role: 'READ_ONLY_COMPATIBILITY'});
    }
  };
}
