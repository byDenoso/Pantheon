// Owner-chosen public selection, published from the private cockpit (nexo-one backend).
// The static catalog (atlas-public.json) stays the source of the reviewed texts; the live
// selection only says which of those rows are shown, plus owner-approved texts and fronts.
// Fail closed: once a selection URL is configured, an unreadable selection never falls back
// to showing everything that the static file happens to contain.
import {isIsoTime, isObj, type Fetch} from './api.ts';
import type {PublicPayload} from './api.ts';

export const SELECTION_URL = String(import.meta.env?.VITE_PUBLIC_SELECTION_URL || '').trim();
export type LiveSelection = {mode: 'UNSET'} | {mode: 'LIVE'; version: number; updatedAt: string; include: string[]; tests: unknown[]; campaigns: unknown[]};

export async function fetchSelection(fetchImpl: Fetch, url = SELECTION_URL, signal?: AbortSignal): Promise<LiveSelection> {
  const res = await fetchImpl(url, {credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal, headers: {Accept: 'application/json'}});
  if (!res.ok || (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase() !== 'application/json') throw new Error('SELECTION_UNAVAILABLE');
  const body: unknown = await res.json();
  if (!isObj(body) || body.contract !== 'ATLAS_PUBLIC_SELECTION_V1') throw new Error('SELECTION_CONTRACT');
  if (body.mode === 'UNSET') return {mode: 'UNSET'};
  if (body.mode !== 'LIVE' || !Number.isSafeInteger(body.version) || !isIsoTime(body.updatedAt)
    || !Array.isArray(body.include) || body.include.length > 1000 || !body.include.every(k => typeof k === 'string' && /^[a-f0-9]{64}$/.test(k))
    || !Array.isArray(body.tests) || body.tests.length > 200 || !Array.isArray(body.campaigns) || body.campaigns.length > 60
    || (body.campaigns.length > 0 && body.campaignsContract !== 'ATLAS_PUBLIC_CAMPAIGNS_V1')) throw new Error('SELECTION_CONTRACT');
  return {mode: 'LIVE', version: body.version as number, updatedAt: body.updatedAt as string, include: body.include as string[], tests: body.tests, campaigns: body.campaigns};
}

/** Same key as the publication record (worker/public-publication.mjs): compact JSON, fixed insertion order. */
export async function publicationKey(row: Record<string, unknown>): Promise<string | null> {
  const fields = ['question', 'answers', 'method', 'result'] as const;
  if (!fields.every(key => isObj(row[key]) && typeof (row[key] as Record<string, unknown>)['pt-BR'] === 'string' && typeof (row[key] as Record<string, unknown>).en === 'string')) return null;
  const content = Object.fromEntries(fields.map(key => { const v = row[key] as Record<string, string>; return [key, {'pt-BR': v['pt-BR'], en: v.en}]; }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Keeps only the selected static rows, then appends the owner-approved rows. Campaigns come from the selection. */
export async function applySelection(payload: PublicPayload, selection: LiveSelection): Promise<{payload: PublicPayload; campaigns?: unknown[]; updatedAt?: string}> {
  if (selection.mode === 'UNSET') return {payload};
  const include = new Set(selection.include);
  const kept: unknown[] = [];
  for (const row of payload.tests ?? []) {
    const key = isObj(row) ? await publicationKey(row) : null;
    if (key && include.has(key)) kept.push(row);
  }
  return {payload: {...payload, tests: [...kept, ...selection.tests]}, campaigns: selection.campaigns, updatedAt: selection.updatedAt};
}
