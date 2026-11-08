// Pure helpers of the live view: date parsing and the merged, newest-first timeline.
import type {MuralRow, ResultadoRow, ResumoRow} from './shadow.ts';
import {humanizeResult, isCodeLine, isIdLike} from './humanize.ts';

export type Kind = 'mural' | 'resultado' | 'resumo';
export type LiveEvent = {key: string; kind: Kind; when: number | null; raw: string; agent: string; to: string; tag: string; title: string; body: string; extra: string; link: string; technical?: string | null};

/** Accepts ISO, "YYYY-MM-DD HH:MM" and "DD/MM/YYYY HH:MM", with or without a trailing "America/Sao_Paulo"; anything else sorts last. */
export function parseWhen(value: string): number | null {
  const v = value.trim().replace(/\s+America\/Sao_Paulo$/i, '');
  if (!v) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}T${br[4] ?? '00'}:${br[5] ?? '00'}:00-03:00` : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(v) ? `${v.replace(' ', 'T')}-03:00` : v;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
/** Short agent name from free-form cells such as "S5|task_id=…|run=…|class=…". */
export function agentName(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '—';
  const m = /^(S\d{1,2}|P|MAPA(?:[ _]VIVO)?|Mapa Vivo|CLAUDE|GPT|LUMIA)(?![A-Za-z0-9])/i.exec(v);
  if (m) return /^mapa/i.test(m[1]) ? 'Mapa Vivo' : /^lumia$/i.test(m[1]) ? 'Lumia' : /^claude$/i.test(m[1]) ? 'Claude' : m[1].toUpperCase();
  return v.split(/[|\s;,]/)[0]!.slice(0, 24) || '—';
}
export const COMPLAINT = /reclama|bloque|conflit|atrapalh|pedido|request|complain|handoff|repasse/i;

export function liveEvents(mural: MuralRow[], resultados: ResultadoRow[], resumo: ResumoRow[]): LiveEvent[] {
  const events: LiveEvent[] = [
    ...mural.map((row, i): LiveEvent => ({key: `m:${row.id || i}:${row.data}`, kind: 'mural', when: parseWhen(row.data), raw: row.data, agent: agentName(row.de), to: row.para ? agentName(row.para) : '', tag: row.tipo || '', title: '', body: isCodeLine(row.texto) ? 'Mensagem técnica sem texto em linguagem corrente.' : row.texto, extra: row.item && !isIdLike(row.item) && !isCodeLine(row.item) ? row.item : '', link: row.link, technical: isCodeLine(row.texto) ? row.texto : null})),
    ...resultados.map((row, i): LiveEvent => { const agent = agentName(row.task || row.item), h = humanizeResult(row, agent); return {key: `r:${i}:${row.data}:${row.item}`, kind: 'resultado', when: parseWhen(row.data), raw: row.data, agent, to: '', tag: '', title: h.title, body: h.body, extra: h.metrics.join(' · '), link: row.link_dados, technical: h.technical}; }),
    ...resumo.map((row, i): LiveEvent => ({key: `s:${i}:${row.data_hora}:${row.item}`, kind: 'resumo', when: parseWhen(row.data_hora), raw: row.data_hora, agent: row.item || '—', to: '', tag: row.nivel, title: isCodeLine(row.o_que_mudou) ? 'Mudança técnica registrada' : row.o_que_mudou, body: isCodeLine(row.impacto) ? '' : row.impacto, extra: '', link: row.link, technical: isCodeLine(row.o_que_mudou) || isCodeLine(row.impacto) ? [row.o_que_mudou, row.impacto].join(' · ') : null})),
  ];
  return events.sort((a, b) => (b.when ?? -Infinity) - (a.when ?? -Infinity));
}

