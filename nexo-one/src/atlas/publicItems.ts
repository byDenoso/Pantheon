// Public items: PROPOSED shape, not approved content. The public area is a positive
// allowlist: whatever the API returns is shown only if it passes this guard, and an
// empty list renders the "not approved yet" state. Nothing is bundled.
import {fetchPublic, fetchPublicCampaignSnapshot, ApiError, isObj, type Fetch, type Locale} from './api.ts';
import {guardPublicCampaigns, type PublicCampaign} from './publicCampaigns.ts';

export const ITEM_KINDS = ['method', 'hypothesis', 'limit', 'robustness', 'note'] as const;
export type ItemKind = typeof ITEM_KINDS[number];
export type Bilingual = {'pt-BR': string; en: string};
export type PublicItem = {id: string; kind: ItemKind; title: Bilingual; plain: Bilingual; technical: Bilingual; credit: string | null};

// Optional presentation projection. The five canonical item kinds are unchanged.
export type PublicTest = {id: string; question: Bilingual; answers: Bilingual; method: Bilingual; result: Bilingual};

export const MAX_ITEMS = 60;
const MAX_TEXT = 4000;

const text = (v: unknown, max = MAX_TEXT): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : null;

function bilingual(v: unknown): Bilingual | null {
  if (!isObj(v)) return null;
  const pt = text(v['pt-BR']);
  const en = text(v.en);
  return pt && en ? {'pt-BR': pt, en} : null;
}

export function guardItem(raw: unknown): PublicItem | null {
  if (!isObj(raw)) return null;
  const id = text(raw.id, 80);
  const kind = ITEM_KINDS.find(k => k === raw.kind);
  const title = bilingual(raw.title);
  const plain = bilingual(raw.plain);
  const technical = bilingual(raw.technical);
  if (!id || !kind || !title || !plain || !technical) return null;
  return {id, kind, title, plain, technical, credit: text(raw.credit, 200)};
}

export function guardItems(raw: unknown[]): PublicItem[] {
  const seen = new Set<string>();
  const out: PublicItem[] = [];
  for (const r of raw) {
    const it = guardItem(r);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Copies only the four reviewed presentation fields; never spreads a source record. */
export function guardTest(raw: unknown): PublicTest | null {
  if (!isObj(raw)) return null;
  const id = text(raw.id, 80);
  const question = bilingual(raw.question);
  const answers = bilingual(raw.answers);
  const method = bilingual(raw.method);
  const result = bilingual(raw.result);
  if (!id || !question || !answers || !method || !result) return null;
  return {id, question, answers, method, result};
}

export function guardTests(raw: unknown[]): PublicTest[] {
  const seen = new Set<string>();
  const out: PublicTest[] = [];
  for (const row of raw) {
    const test = guardTest(row);
    if (!test || seen.has(test.id)) continue;
    seen.add(test.id);
    out.push(test);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export type PublicState = {status: 'loading' | 'empty' | 'ready' | 'unavailable'; items: PublicItem[]; tests: PublicTest[]; campaigns?: PublicCampaign[]; coverage?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; generatedAt?: string; sourceRevision?: string};

export async function loadPublic(fetchImpl: Fetch, signal?: AbortSignal, staticPath?: string): Promise<PublicState> {
  try {
    let payload;
    try { payload = await fetchPublic(fetchImpl, signal); } catch (e) {
      if (!staticPath || !(e instanceof ApiError) || e.code !== 'NOT_DEPLOYED') throw e;
      payload = await fetchPublicCampaignSnapshot(fetchImpl, staticPath, signal);
    }
    const items = guardItems(payload.items);
    const tests = guardTests(payload.tests ?? []);
    const extra = payload.campaigns === undefined ? {} : {campaigns: guardPublicCampaigns(payload.campaigns), coverage: payload.coverage, generatedAt: payload.generatedAt, sourceRevision: payload.sourceRevision};
    if (payload.campaigns?.length && !extra.campaigns?.length) throw new ApiError('CONTRACT', 200);
    return items.length || tests.length || extra.campaigns?.length || (extra.campaigns && extra.coverage !== 'COMPLETE') ? {status: 'ready', items, tests, ...extra} : {status: 'empty', items: [], tests: [], ...extra};
  } catch (e) {
    if (e instanceof ApiError && e.code === 'ABORTED') throw e;
    // No bundled example, private record or inferred result is used as a fallback.
    return {status: 'unavailable', items: [], tests: []};
  }
}
export const pick = (b: Bilingual, l: Locale) => b[l];
