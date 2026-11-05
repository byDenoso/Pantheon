import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import ActivityChart from './ActivityChart.tsx';
import type {Row} from './api.ts';
import {COMPLAINT, agentName, liveEvents, type Kind} from '../private-workspace/liveEvents.ts';
import type {MuralRow, ResultadoRow, ResumoRow} from '../private-workspace/shadow.ts';

// "Ao vivo" in the cockpit: who is working, what was posted on the Mural and which
// results just landed. Reads the SHADOW rows the cockpit already loaded; the cockpit's
// own one-minute refresh brings new items, which arrive animated.
const ACTIVE_MS = 90 * 60_000;
const LABEL: Record<Kind, string> = {mural: 'Mural', resultado: 'Resultado', resumo: 'Mudança'};
export const hue = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
export const initials = (name: string) => /^(S\d{1,2}|P|GPT)$/.test(name) ? name : name === 'Mapa Vivo' ? 'MV' : name === 'Lumia' ? 'LU' : name === 'Claude' ? 'CL' : name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 3) || '?';
export const ago = (t: number | null, now: number) => {
  if (t === null) return 'sem data';
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : new Intl.DateTimeFormat('pt-BR', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(t));
};

export default function CockpitLive({mural, resultados, resumo, equipe, activityComplete}: {mural: Row[]; resultados: Row[]; resumo: Row[]; equipe: Row[]; activityComplete: boolean}) {
  const [filter, setFilter] = useState<'all' | Kind | 'complaints'>('all'), [limit, setLimit] = useState(12), [now, setNow] = useState(() => Date.now());
  const events = useMemo(() => liveEvents(mural as unknown as MuralRow[], resultados as unknown as ResultadoRow[], resumo as unknown as ResumoRow[]), [mural, resultados, resumo]);
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => { const before = seen.current; seen.current = new Set(events.map(e => e.key)); return before ? new Set(events.filter(e => !before.has(e.key)).map(e => e.key)) : new Set<string>(); }, [events]);
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(tick); }, []);

  const agents = useMemo(() => {
    const map = new Map<string, {name: string; last: number | null; what: string}>();
    for (const row of equipe) if (row.papel) map.set(agentName(row.papel), {name: agentName(row.papel), last: null, what: row.frentes ?? ''});
    for (const e of [...events].reverse()) {
      if (!e.agent || e.agent === '—' || e.kind === 'resumo') continue;
      const prev = map.get(e.agent) ?? {name: e.agent, last: null, what: ''};
      if (e.when !== null && (prev.last === null || e.when >= prev.last)) map.set(e.agent, {...prev, last: e.when, what: e.title || e.body});
      else if (!map.has(e.agent)) map.set(e.agent, prev);
    }
    return [...map.values()].sort((a, b) => (b.last ?? 0) - (a.last ?? 0)).slice(0, 12);
  }, [equipe, events]);

  const isComplaint = (e: typeof events[number]) => e.kind === 'mural' && COMPLAINT.test(`${e.tag} ${e.body}`);
  const shown = events.filter(e => filter === 'all' || (filter === 'complaints' ? isComplaint(e) : e.kind === filter));
  const filters: [typeof filter, string][] = [['all', 'Tudo'], ['mural', 'Mural'], ['resultado', 'Resultados'], ['resumo', 'Mudanças'], ['complaints', 'Reclamações e pedidos']];
  return <div className="ck-live">
    {activityComplete ? <ActivityChart events={events} end={now}/> : <p className="ck-note" role="status">Gráfico indisponível: uma ou mais abas de atividade não puderam ser lidas. Os registros disponíveis continuam abaixo.</p>}
    <ul className="ck-agents">{agents.map(a => { const on = a.last !== null && now - a.last < ACTIVE_MS; return <li key={a.name} className="ck-agent" data-active={on} style={{'--agent-hue': hue(a.name)} as CSSProperties}>
      <span className="ck-avatar" aria-hidden="true">{initials(a.name)}</span>
      <div><strong>{a.name}</strong><small>{on ? 'registro recente' : 'sem registro recente no recorte'} · {ago(a.last, now)}</small>{a.what && <p>{a.what}</p>}</div>
    </li>; })}</ul>
    <div className="ck-seg ck-live-filters" role="group" aria-label="Filtrar linha do tempo">{filters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(12); }}>{label}</button>)}</div>
    <ol className="ck-feed" aria-live="polite">{shown.slice(0, limit).map(e => <li key={e.key} className="ck-feed-item" data-kind={e.kind} data-alert={isComplaint(e) || undefined} data-fresh={fresh.has(e.key) || undefined} style={{'--agent-hue': hue(e.agent)} as CSSProperties}>
      <span className="ck-avatar" aria-hidden="true">{initials(e.agent)}</span>
      <div>
        <p className="ck-feed-head"><strong>{e.agent}</strong>{e.to && <> para <strong>{e.to}</strong></>}<span className="ck-chip">{LABEL[e.kind]}{e.tag ? ` · ${e.tag}` : ''}</span><time title={e.raw}>{ago(e.when, now)}</time></p>
        {e.title && <h3>{e.title}</h3>}
        {e.body && <p>{e.body}</p>}
        {e.extra && <p className="ck-muted">{e.extra}</p>}
        {e.technical && <details className="live-tech"><summary>Detalhes técnicos</summary><pre>{e.technical}</pre></details>}
        {e.link && /^https:\/\//.test(e.link) && <a href={e.link} target="_blank" rel="noreferrer noopener">Abrir</a>}
      </div>
    </li>)}</ol>
    {!shown.length && <p className="ck-muted">Nenhum registro disponível neste recorte.</p>}
    {shown.length > limit && <button type="button" className="ck-btn quiet" onClick={() => setLimit(v => v + 12)}>Ver mais</button>}
  </div>;
}
