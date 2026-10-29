import {guardPublicCampaigns, type PublicCampaign} from './canonicalPublicCampaigns.ts';
// Public items: PROPOSED shape, not approved content. The public area is a positive
// allowlist: whatever the API returns is shown only if it passes this guard, and an
// empty list renders the "not approved yet" state. Nothing is bundled.
import {fetchPublic, ApiError, isObj, type Fetch, type Locale} from './api.ts';
import {isCompletePublicTest} from './publicCompleteness.ts';
import {guardVisual,visualsForTest,type PublicVisual} from './publicVisuals.ts';

export const ITEM_KINDS = ['method', 'hypothesis', 'limit', 'robustness', 'note'] as const;
export type ItemKind = typeof ITEM_KINDS[number];
export type Bilingual = {'pt-BR': string; en: string};
export type PublicItem = {id: string; kind: ItemKind; title: Bilingual; plain: Bilingual; technical: Bilingual; credit: string | null};

// Optional presentation projection. The five canonical item kinds are unchanged.
export type PublicTest = {id: string; question: Bilingual; answers: Bilingual; method: Bilingual; result: Bilingual; published_at?: string | null; updated_at?: string | null};

export const MAX_ITEMS = 60;
export const MAX_PUBLIC_TESTS = 1000;
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

export function publicDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() ? new Date(time).toISOString() : null;
}

/** Copies only the four reviewed presentation fields; never spreads a source record. */
export function guardTest(raw: unknown, localKey = 'study'): PublicTest | null {
  if (!isObj(raw) || !isCompletePublicTest(raw)) return null;
  const question = bilingual(raw.question);
  const answers = bilingual(raw.answers);
  const method = bilingual(raw.method);
  const result = bilingual(raw.result);
  if (!question || !answers || !method || !result) return null;
  const published_at = publicDate(raw.published_at);
  const updated = publicDate(raw.updated_at);
  const updated_at = updated && (!published_at || updated >= published_at) ? updated : null;
  return {id: localKey, question, answers, method, result, published_at, updated_at};
}

export function guardTests(raw: unknown[]): PublicTest[] {
  const seen = new Set<string>();
  const out: PublicTest[] = [];
  for (const [index, row] of raw.entries()) {
    const test = guardTest(row, `study-${index + 1}`);
    if (!test || seen.has(test.id)) continue;
    seen.add(test.id);
    out.push(test);
    if (out.length >= MAX_PUBLIC_TESTS) break;
  }
  return out;
}

export type PublicState = {status: 'loading' | 'empty' | 'ready' | 'unavailable'; items: PublicItem[]; tests: PublicTest[]; campaigns?: PublicCampaign[]; coverage?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; generatedAt?: string; visuals?:PublicVisual[]};

export async function loadPublic(fetchImpl: Fetch, signal?: AbortSignal): Promise<PublicState> {
  try {
    const payload = await fetchPublic(fetchImpl, signal);
    const items = guardItems(payload.items);
    const tests = guardTests(payload.tests ?? []);
    const visuals=(payload.visuals??[]).map(guardVisual);
    if(visuals.some(v=>!v)||new Set(visuals.map(v=>v!.id)).size!==visuals.length)throw new ApiError('CONTRACT',200);
    const visualFields=payload.visuals===undefined?{}:{visuals:visuals as PublicVisual[]};
    const verifyVisuals=(campaigns:PublicCampaign[]=[])=>{for(const v of visuals as PublicVisual[]){const s=v.subject;if(s.kind==='legacy-test'){if(!tests.some(t=>visualsForTest([v],t).length))throw new ApiError('CONTRACT',200);}else{const t=campaigns.find(c=>c.id===s.campaignId)?.tests.find(t=>t.id===s.testId);if(t?.stage!=='REVIEWED'||!t.result||t.updatedAt!==s.updatedAt||JSON.stringify(t.result)!==JSON.stringify(s.result))throw new ApiError('CONTRACT',200);}}};
    if (payload.campaigns !== undefined) {
      const campaigns = guardPublicCampaigns(payload.campaigns);
      if (campaigns.length !== payload.campaigns.length) throw new ApiError('CONTRACT', 200);
      verifyVisuals(campaigns);
      return {status: 'ready', items, tests, campaigns, coverage: payload.coverage, generatedAt: payload.generatedAt,...visualFields};
    }
    verifyVisuals();
    return items.length || tests.length ? {status: 'ready', items, tests,...visualFields} : {status: 'empty', items: [], tests: [],...visualFields};
  } catch (e) {
    if (e instanceof ApiError && e.code === 'ABORTED') throw e;
    // No bundled example, private record or inferred result is used as a fallback.
    return {status: 'unavailable', items: [], tests: []};
  }
}
export const pick = (b: Bilingual, l: Locale) => b[l];
