import {createHash} from 'node:crypto';

/**
 * Optional public presentation over the existing normalized Tower `records.tests`.
 * This is a review projection, not a source, database, new scientific schema or
 * publication trigger. The public HTTP route still reads no private source.
 * A future publication change must be explicitly approved and code reviewed.
 *
 * @typedef {{'pt-BR': string, en: string}} Bilingual
 * @typedef {{id: string, question: Bilingual, answers: Bilingual, method: Bilingual, result: Bilingual}} PublicTest
 * @typedef {{testId: string, sourceDigest: string, publicId: string, question: Bilingual, answers: Bilingual, method: Bilingual, result: Bilingual}} Approval
 */

/** @type {ReadonlyArray<Readonly<Approval>>} No research content has been approved. */
export const APPROVED_PUBLIC_TESTS = Object.freeze([]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 4000) => typeof value === 'string' && value.trim() && value.length <= max ? value : null;
const bilingual = value => object(value) && text(value['pt-BR']) && text(value.en) ? {'pt-BR': value['pt-BR'], en: value.en} : null;
const stable = value => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

/** Bind an approval to the entire canonical record, including its uncertainty and review state. */
export function publicTestSourceDigest(record) {
  if (!object(record) || !text(record.id, 200)) return null;
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(record))).digest('hex')}`;
}

/**
 * Project only reviewed bilingual text. No raw field, identifier, status, metric,
 * link, path or private metadata is copied from the canonical record.
 * Any source change, even a new limitation or review status, invalidates approval.
 * @param {{tests?: Array<Record<string, unknown>>}} records Same shape as normalizePrivateTower().records
 * @param {ReadonlyArray<Readonly<Approval>>} approvals Explicit code-reviewed public allowlist
 * @returns {PublicTest[]}
 */
export function projectApprovedPublicTests(records, approvals = APPROVED_PUBLIC_TESTS) {
  if (!object(records) || !Array.isArray(records.tests) || !Array.isArray(approvals) || !approvals.length) return [];
  const sources = new Map();
  const duplicates = new Set();
  for (const record of records.tests) {
    if (!object(record) || !text(record.id, 200)) continue;
    if (sources.has(record.id)) duplicates.add(record.id);
    sources.set(record.id, record);
  }
  const seen = new Set(), out = [];
  for (const approval of approvals) {
    if (!object(approval) || !text(approval.testId, 200) || !text(approval.publicId, 80) || seen.has(approval.publicId) || duplicates.has(approval.testId)) continue;
    const source = sources.get(approval.testId);
    if (!source || !/^sha256:[a-f0-9]{64}$/.test(approval.sourceDigest ?? '') || publicTestSourceDigest(source) !== approval.sourceDigest) continue;
    const question = bilingual(approval.question), answers = bilingual(approval.answers), method = bilingual(approval.method), result = bilingual(approval.result);
    if (!question || !answers || !method || !result) continue;
    out.push({id: approval.publicId, question, answers, method, result});
    seen.add(approval.publicId);
    if (out.length >= 60) break;
  }
  return out;
}
