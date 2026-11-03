// Pure helpers of the cockpit "Equipe" section: what each automation declares on the EQUIPE
// tab (role, cadence, fronts, state) joined with what it actually posted on the Mural and
// Resultados. Nothing here guesses a schedule the cadence text does not state.
import {agentName, type LiveEvent} from '../private-workspace/liveEvents.ts';
import type {Row} from './api.ts';

export type Tone = 'ok' | 'warn' | 'bad' | undefined;
export const tone = (value = ''): Tone => /erro|falh|bloq|parad|block|fail|desativ|off|alert/i.test(value) ? 'bad' : /aguard|pend|paus|revis|wait/i.test(value) ? 'warn' : /ativ|rodando|andamento|ok|conclu|running|done/i.test(value) ? 'ok' : undefined;

export type Cadence =
  | {kind: 'hourly'; every: number; minute: number; label: string}
  | {kind: 'minutes'; every: number; label: string}
  | {kind: 'daily'; hour: number; minute: number; label: string}
  | {kind: 'unknown'; label: string};

const two = (n: number) => String(n).padStart(2, '0');

/** Reads "1h minuto 06", "3h às :10", "a cada 30 min", "diário 08:00". Anything else keeps its own text. */
export function parseCadence(raw = ''): Cadence {
  const v = raw.trim();
  const daily = /(di[aá]ri|todo dia|daily)/i.test(v) ? /(\d{1,2})\s*[:h]\s*(\d{2})/.exec(v) : null;
  if (daily) { const hour = Number(daily[1]), minute = Number(daily[2]); if (hour < 24 && minute < 60) return {kind: 'daily', hour, minute, label: `Diária, às ${two(hour)}:${two(minute)}`}; }
  const hours = /(\d+)\s*h(?:oras?)?\b\D*?(\d{1,2})\b/i.exec(v), eachHour = hours ? null : /(?:a cada|toda)\s+hora\D*?(\d{1,2})\b/i.exec(v);
  if (hours || eachHour) {
    const every = hours ? Number(hours[1]) : 1, minute = Number(hours ? hours[2] : eachHour![1]);
    if (every >= 1 && every <= 24 && minute < 60) return {kind: 'hourly', every, minute, label: every === 1 ? `A cada hora, no minuto ${two(minute)}` : `A cada ${every} h, no minuto ${two(minute)}`};
  }
  const minutes = /(\d+)\s*min(?:utos?)?\b/i.exec(v);
  if (minutes && !/\d\s*h\b/i.test(v)) { const every = Number(minutes[1]); if (every >= 1 && every < 1440) return {kind: 'minutes', every, label: `A cada ${every} min`}; }
  return {kind: 'unknown', label: v || 'Cadência não declarada'};
}

/** Next run, only when the cadence fixes it without an unknown anchor: hourly at a given minute. */
export function nextRun(cadence: Cadence, now: number): number | null {
  if (cadence.kind !== 'hourly' || cadence.every !== 1) return null;
  const d = new Date(now); d.setMinutes(cadence.minute, 0, 0);
  const t = d.getTime();
  return t > now ? t : t + 3_600_000;
}

/** Splits the fronts cell on commas and semicolons that are not inside parentheses. */
export function splitFronts(raw = ''): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of raw) {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if ((ch === ',' || ch === ';') && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export type CrewMember = {
  name: string; papel: string; estado: string; tone: Tone; cadence: Cadence; next: number | null;
  last: number | null; lastText: string; hours: number[]; activeHours: number; fronts: string[];
};

const HOUR = 3_600_000;

/** One entry per EQUIPE row, ordered: alerts first, then the soonest scheduled run, then the rest by name. */
export function crew(equipe: Row[], events: LiveEvent[], now: number): CrewMember[] {
  const members = equipe.filter(r => (r.papel ?? '').trim()).map((r): CrewMember => {
    const name = agentName(r.papel), cadence = parseCadence(r.cadencia), t = tone(r.estado);
    const own = events.filter(e => e.agent === name && e.kind !== 'resumo' && e.when !== null && e.when <= now);
    const hours = Array.from({length: 24}, () => 0);
    for (const e of own) { const ago = Math.floor((now - (e.when as number)) / HOUR); if (ago >= 0 && ago < 24) hours[23 - ago]++; }
    const latest = own.reduce<LiveEvent | null>((a, e) => !a || (e.when as number) > (a.when as number) ? e : a, null);
    return {
      name, papel: r.papel.trim(), estado: (r.estado ?? '').trim(), tone: t, cadence,
      next: t === 'bad' || t === 'warn' ? null : nextRun(cadence, now),
      last: latest?.when ?? null, lastText: latest ? (latest.title || latest.body) : '',
      hours, activeHours: hours.filter(n => n > 0).length, fronts: splitFronts(r.frentes),
    };
  });
  const rank = (m: CrewMember) => m.tone === 'bad' ? 0 : m.tone === 'warn' ? 1 : 2;
  return members.sort((a, b) => rank(a) - rank(b) || (a.next ?? Infinity) - (b.next ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR'));
}
