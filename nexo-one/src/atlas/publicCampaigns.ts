import {isIsoTime, isObj, type Locale} from './api.ts';
import type {Bilingual} from './publicItems.ts';
export type PublicReference = {label: Bilingual; url: string};
export type PublicResult = {verdict: 'SUPPORTS' | 'NULL' | 'FALSIFIES' | 'INCONCLUSIVE'; summary: Bilingual; limitations: Bilingual[] | null};
export type PublicCampaignTest = {id: string; question: Bilingual; method: Bilingual | null; stage: 'PLANNED' | 'RUNNING' | 'AWAITING_REVIEW' | 'REVIEWED' | 'BLOCKED' | 'PAUSED' | 'UNKNOWN'; updatedAt: string; result: PublicResult | null; references: PublicReference[]};
export type PublicCampaign = {id: string; questionId: string; question: Bilingual; why: Bilingual | null; method: Bilingual | null; currentStage: Bilingual | null; nextStep: Bilingual | null; limitations: Bilingual[] | null; updatedAt: string; state: 'ongoing' | 'completed'; closure: {closedAt: string; reason: string; outcome: PublicResult['verdict'] | null; summary: Bilingual} | null; tests: PublicCampaignTest[]; testsCoverage: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; references: PublicReference[]};
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v);
const bi = (v: unknown): Bilingual | null => isObj(v) && ['pt-BR', 'en'].every(k => typeof v[k] === 'string' && (v[k] as string).trim() && (v[k] as string).length <= 4000) ? {'pt-BR': v['pt-BR'] as string, en: v.en as string} : null;
const limits = (v: unknown): Bilingual[] | null => Array.isArray(v) && v.length <= 40 && v.every(bi) ? v.map(x => bi(x)!) : null;
const verdicts: PublicResult['verdict'][] = ['SUPPORTS', 'NULL', 'FALSIFIES', 'INCONCLUSIVE'];
const stages: PublicCampaignTest['stage'][] = ['PLANNED', 'RUNNING', 'AWAITING_REVIEW', 'REVIEWED', 'BLOCKED', 'PAUSED', 'UNKNOWN'];
const references = (v: unknown): PublicReference[] => Array.isArray(v) ? v.slice(0, 20).flatMap(r => {
  if (!isObj(r) || !bi(r.label) || typeof r.url !== 'string') return [];
  try { const u = new URL(r.url); return u.protocol === 'https:' && !u.username && !u.password ? [{label: bi(r.label)!, url: u.href}] : []; } catch { return []; }
}) : [];
export function guardPublicCampaign(raw: unknown): PublicCampaign | null {
  if (!isObj(raw) || !id(raw.id) || !id(raw.questionId) || !bi(raw.question) || !isIsoTime(raw.updatedAt) || !['ongoing', 'completed'].includes(String(raw.state)) || !Array.isArray(raw.tests) || raw.tests.length > 10000) return null;
  const c = raw.closure;
  const closure = isObj(c) && isIsoTime(c.closedAt) && (c.outcome === null || verdicts.includes(c.outcome as PublicResult['verdict'])) && bi(c.summary) ? {closedAt: c.closedAt, reason: typeof c.reason === 'string' && ['SUCCESS', 'KILL', 'SATURATION', 'BUDGET', 'OTHER'].includes(c.reason) ? c.reason : 'OTHER', outcome: c.outcome as PublicResult['verdict'] | null, summary: bi(c.summary)!} : null;
  if (raw.state === 'completed' && !closure) return null;
  const seen = new Set();
  const tests = raw.tests.flatMap(t => {
    if (!isObj(t) || !id(t.id) || seen.has(t.id) || !bi(t.question) || !isIsoTime(t.updatedAt) || !stages.includes(t.stage as PublicCampaignTest['stage'])) return [];
    seen.add(t.id);
    const r = t.result;
    const result = isObj(r) && verdicts.includes(r.verdict as PublicResult['verdict']) && bi(r.summary) ? {verdict: r.verdict as PublicResult['verdict'], summary: bi(r.summary)!, limitations: limits(r.limitations)} : null;
    return [{id: t.id, question: bi(t.question)!, method: bi(t.method), stage: t.stage as PublicCampaignTest['stage'], updatedAt: t.updatedAt, result, references: references(t.references)}];
  });
  return {id: raw.id, questionId: raw.questionId, question: bi(raw.question)!, why: bi(raw.why), method: bi(raw.method), currentStage: bi(raw.currentStage), nextStep: bi(raw.nextStep), limitations: limits(raw.limitations), updatedAt: raw.updatedAt, state: raw.state as PublicCampaign['state'], closure, tests, testsCoverage: ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'].includes(String(raw.testsCoverage)) ? raw.testsCoverage as PublicCampaign['testsCoverage'] : 'UNAVAILABLE', references: references(raw.references)};
}
export function guardPublicCampaigns(raw: unknown[]): PublicCampaign[] {
  const ids = new Set(), questions = new Set();
  return raw.slice(0, 10000).flatMap(r => { const c = guardPublicCampaign(r); if (!c || ids.has(c.id) || questions.has(c.questionId)) return []; ids.add(c.id); questions.add(c.questionId); return [c]; });
}
export function campaignPage(campaigns: PublicCampaign[], {state, search = '', page = 0, locale = 'pt-BR'}: {state: PublicCampaign['state']; search?: string; page?: number; locale?: Locale}) {
  const query = search.trim().toLocaleLowerCase(locale);
  const filtered = campaigns.filter(c => c.state === state && (!query || c.question[locale].toLocaleLowerCase(locale).includes(query)));
  const pages = Math.max(1, Math.ceil(filtered.length / 6)), current = Math.max(0, Math.min(Math.floor(page), pages - 1));
  return {items: filtered.slice(current * 6, (current + 1) * 6), total: filtered.length, page: current, pages};
}
export function campaignHref(id: string) { return `?campanha=${encodeURIComponent(id)}#/`; }
