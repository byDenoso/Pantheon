import {useEffect, useMemo, useRef, useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
import type {Lang} from '../i18n/state-language.ts';
import {shadowBoardOf} from './shadow.ts';
import {COMPLAINT, agentName, liveEvents, type Kind} from './liveEvents.ts';

// Live view over the SHADOW board the Host already reads: who is working, what they
// posted on the Mural and which results just landed. Presentation only; refreshing
// re-runs the Host's own authenticated read.

const REFRESH_MS = 60_000, ACTIVE_MS = 90 * 60_000;
const COPY = {
  pt: {title: 'Ao vivo', lead: 'O que as automações estão fazendo agora: recados no Mural, resultados novos e mudanças de rumo. Atualiza sozinho a cada minuto.', agents: 'Equipe', active: 'ativa', idle: 'parada', last: 'último sinal', feed: 'Linha do tempo', all: 'Tudo', mural: 'Mural', resultado: 'Resultados', resumo: 'Mudanças', complaints: 'Reclamações e pedidos', auto: 'Atualização automática', updated: 'Lida às', empty: 'Nada por aqui ainda.', unknown: 'sem data', more: 'Ver mais', to: 'para'},
  en: {title: 'Live', lead: 'What the automations are doing now: Mural posts, new results and changes of course. Refreshes itself every minute.', agents: 'Team', active: 'active', idle: 'idle', last: 'last signal', feed: 'Timeline', all: 'All', mural: 'Mural', resultado: 'Results', resumo: 'Changes', complaints: 'Complaints and requests', auto: 'Auto refresh', updated: 'Read at', empty: 'Nothing here yet.', unknown: 'no date', more: 'Show more', to: 'to'},
} as const;

const hue = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const initials = (name: string) => /^(S\d{1,2}|P|GPT)$/.test(name) ? name : name === 'Mapa Vivo' ? 'MV' : name === 'Lumia' ? 'LU' : name === 'Claude' ? 'CL' : name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 3) || '?';
const ago = (t: number | null, lang: 'pt' | 'en', now: number) => {
  if (t === null) return COPY[lang].unknown;
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return lang === 'en' ? `${min} min ago` : `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return lang === 'en' ? `${h} h ago` : `há ${h} h`;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-BR', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(t));
};

export default function LiveView({state, lang, refresh}: {state: SystemState; lang: Lang; refresh?: () => Promise<void>}) {
  const l = lang === 'en' ? 'en' : 'pt', c = COPY[l];
  const board = useMemo(() => shadowBoardOf(state), [state]);
  const [filter, setFilter] = useState<'all' | Kind | 'complaints'>('all'), [limit, setLimit] = useState(30);
  const [auto, setAuto] = useState(true), [readAt, setReadAt] = useState(() => Date.now()), [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);
  const events = useMemo(() => liveEvents(board?.mural ?? [], board?.resultados ?? [], board?.resumo ?? []), [board]);
  // Items not present in the previous read get the arrival animation.
  const fresh = useMemo(() => { const before = seen.current; const next = new Set(events.map(e => e.key)); seen.current = next; return before ? new Set(events.filter(e => !before.has(e.key)).map(e => e.key)) : new Set<string>(); }, [events]);
  useEffect(() => { setReadAt(Date.now()); }, [state]);
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(tick); }, []);
  useEffect(() => {
    if (!auto || !refresh) return;
    let busy = false;
    const run = () => { if (busy || document.hidden) return; busy = true; refresh().catch(() => undefined).finally(() => { busy = false; }); };
    const timer = setInterval(run, REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, refresh]);

  const agents = useMemo(() => {
    const map = new Map<string, {name: string; last: number | null; what: string; role: string}>();
    for (const row of board?.equipe ?? []) map.set(agentName(row.papel), {name: agentName(row.papel), last: null, what: row.frentes, role: row.estado});
    for (const e of [...events].reverse()) {
      if (!e.agent || e.agent === '—' || e.kind === 'resumo') continue;
      const prev = map.get(e.agent) ?? {name: e.agent, last: null, what: '', role: ''};
      if (e.when !== null && (prev.last === null || e.when >= prev.last)) map.set(e.agent, {...prev, last: e.when, what: e.title || e.body});
      else if (!map.has(e.agent)) map.set(e.agent, prev);
    }
    return [...map.values()].sort((a, b) => (b.last ?? 0) - (a.last ?? 0)).slice(0, 16);
  }, [board, events]);

  const shown = events.filter(e => filter === 'all' || (filter === 'complaints' ? e.kind === 'mural' && COMPLAINT.test(`${e.tag} ${e.body}`) : e.kind === filter));
  const filters: [typeof filter, string][] = [['all', c.all], ['mural', c.mural], ['resultado', c.resultado], ['resumo', c.resumo], ['complaints', c.complaints]];
  return <main className="pw-page pw-live">
    <div className="pw-page-title"><h1 data-private-heading tabIndex={-1}>{c.title}<span className="pw-live-dot" aria-hidden="true"/></h1><p>{c.lead}</p>
      <p className="pw-live-meta"><label><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)} disabled={!refresh}/> {c.auto}</label><span>{c.updated} <time dateTime={new Date(readAt).toISOString()}>{new Intl.DateTimeFormat(l === 'en' ? 'en-GB' : 'pt-BR', {timeStyle: 'short'}).format(readAt)}</time></span></p>
    </div>
    {board?.unavailable && <p className="pw-empty" role="status">{board.unavailable}</p>}
    <section aria-label={c.agents}><h2>{c.agents}</h2>
      <ul className="pw-agents">{agents.map(agent => { const on = agent.last !== null && now - agent.last < ACTIVE_MS; return <li key={agent.name} className="pw-agent" data-active={on} style={{'--agent-hue': hue(agent.name)} as React.CSSProperties}>
        <span className="pw-agent-avatar" aria-hidden="true">{initials(agent.name)}</span>
        <div><strong>{agent.name}</strong><small>{on ? c.active : c.idle} · {c.last} {ago(agent.last, l, now)}</small>{agent.what && <p>{agent.what}</p>}</div>
      </li>; })}</ul>
      {!agents.length && <p className="pw-empty">{c.empty}</p>}
    </section>
    <section aria-label={c.feed}><h2>{c.feed}</h2>
      <div className="pw-tabs" role="group" aria-label={c.feed}>{filters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(30); }}>{label}</button>)}</div>
      <ol className="pw-feed" aria-live="polite">{shown.slice(0, limit).map(e => <li key={e.key} className="pw-feed-item" data-kind={e.kind} data-alert={e.kind === 'mural' && COMPLAINT.test(`${e.tag} ${e.body}`) || undefined} data-fresh={fresh.has(e.key) || undefined} style={{'--agent-hue': hue(e.agent)} as React.CSSProperties}>
        <span className="pw-agent-avatar" aria-hidden="true">{initials(e.agent)}</span>
        <div>
          <p className="pw-feed-head"><strong>{e.agent}</strong>{e.to && <> {c.to} <strong>{e.to}</strong></>}<span className="pw-feed-kind">{c[e.kind]}{e.tag ? ` · ${e.tag}` : ''}</span><time dateTime={e.when ? new Date(e.when).toISOString() : undefined} title={e.raw}>{ago(e.when, l, now)}</time></p>
          {e.title && <h3>{e.title}</h3>}
          {e.body && <p>{e.body}</p>}
          {e.extra && <p className="pw-feed-extra">{e.extra}</p>}
          {e.link && /^https:\/\//.test(e.link) && <a href={e.link} target="_blank" rel="noreferrer noopener">{l === 'en' ? 'Open' : 'Abrir'}</a>}
        </div>
      </li>)}</ol>
      {!shown.length && <p className="pw-empty" role="status">{c.empty}</p>}
      {shown.length > limit && <button type="button" className="pw-button" onClick={() => setLimit(v => v + 30)}>{c.more}</button>}
    </section>
  </main>;
}
