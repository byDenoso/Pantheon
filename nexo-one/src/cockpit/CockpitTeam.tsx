import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import type {Row} from './api.ts';
import {liveEvents} from '../private-workspace/liveEvents.ts';
import type {MuralRow, ResultadoRow, ResumoRow} from '../private-workspace/shadow.ts';
import {ago, initials} from './CockpitLive.tsx';
import {crew, type CrewMember} from './team.ts';

// "Equipe" in the cockpit: one instrument card per automation. The EQUIPE tab says what each
// one should do and when; the Mural and Resultados say what it actually did. The dial and the
// 24-hour strip put both side by side so a silent or late automation shows at a glance.
const ACTIVE_MS = 90 * 60_000;
const R = 27, C = 2 * Math.PI * R;
const hhmm = (t: number) => new Intl.DateTimeFormat('pt-BR', {hour: '2-digit', minute: '2-digit'}).format(new Date(t));
const minutesTo = (t: number, now: number) => Math.max(1, Math.ceil((t - now) / 60_000));

function Dial({m, now}: {m: CrewMember; now: number}) {
  const hourly = m.cadence.kind === 'hourly';
  const angle = hourly ? (m.cadence as {minute: number}).minute / 60 * 2 * Math.PI : 0;
  const progress = m.next !== null ? 1 - (m.next - now) / 3_600_000 : 0;
  const center = m.next !== null ? String(minutesTo(m.next, now)) : m.tone === 'bad' ? '!' : m.tone === 'warn' ? '‖' : '—';
  return <svg className="ck-dial" viewBox="0 0 72 72" aria-hidden="true">
    <circle className="track" cx="36" cy="36" r={R}/>
    {m.next !== null && <circle className="arc" cx="36" cy="36" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))} transform="rotate(-90 36 36)"/>}
    {hourly && <circle className="mark" cx={36 + R * Math.sin(angle)} cy={36 - R * Math.cos(angle)} r="3.5"/>}
    <text x="36" y={m.next !== null ? 38 : 42}>{center}</text>
    {m.next !== null && <text className="unit" x="36" y="50">MIN</text>}
  </svg>;
}

function nextText(m: CrewMember, now: number) {
  if (m.next !== null) return `às ${hhmm(m.next)} · em ${minutesTo(m.next, now)} min`;
  if (m.tone === 'warn') return 'Em pausa; nenhuma execução prevista';
  if (m.tone === 'bad') return 'Parada; nenhuma execução prevista';
  if (m.cadence.kind === 'unknown') return 'Sem horário na cadência declarada';
  return 'Horário de início não declarado';
}

export default function CockpitTeam({equipe, mural, resultados, resumo}: {equipe: Row[]; mural: Row[]; resultados: Row[]; resumo: Row[]}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const tick = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(tick); }, []);
  const events = useMemo(() => liveEvents(mural as unknown as MuralRow[], resultados as unknown as ResultadoRow[], resumo as unknown as ResumoRow[]), [mural, resultados, resumo]);
  const members = useMemo(() => crew(equipe, events, now), [equipe, events, now]);
  if (!members.length) return <p className="ck-note">Aba EQUIPE vazia.</p>;

  const count = (t: CrewMember['tone']) => members.filter(m => m.tone === t).length;
  const soon = members.filter(m => m.next !== null).sort((a, b) => a.next! - b.next!)[0];
  return <div className="ck-crew">
    <p className="ck-crew-summary">
      <span><b>{count('ok')}</b>ativas</span>
      <span data-tone="warn"><b>{count('warn')}</b>em pausa ou aguardando</span>
      <span data-tone="bad"><b>{count('bad')}</b>com alerta</span>
      {soon && <span className="ck-crew-soon">Próxima execução: <b>{soon.name}</b> em {minutesTo(soon.next!, now)} min</span>}
    </p>
    <ul className="ck-crew-grid">{members.map((m, i) => {
      const on = m.last !== null && now - m.last < ACTIVE_MS, peak = Math.max(1, ...m.hours);
      return <li key={`${m.papel}:${i}`} className="ck-crew-card" data-tone={m.tone} data-active={on}>
        <div className="ck-crew-top">
          <span className="ck-avatar" aria-hidden="true">{initials(m.name)}</span>
          <div className="ck-crew-id"><strong>{m.name}</strong>{m.papel !== m.name && <small title={m.papel}>{m.papel}</small>}</div>
          <span className="ck-state" data-tone={m.tone}>{m.estado || 'sem estado'}</span>
        </div>
        <div className="ck-crew-run">
          <Dial m={m} now={now}/>
          <dl>
            <div><dt>Cadência</dt><dd>{m.cadence.label}</dd></div>
            <div><dt>Próxima execução</dt><dd>{nextText(m, now)}</dd></div>
            <div><dt>Último registro</dt><dd>{m.last === null ? 'nenhum no Mural ou em Resultados' : `${ago(m.last, now)}${on ? ' · trabalhando' : ''}`}</dd></div>
          </dl>
        </div>
        <div>
          <div className="ck-crew-pulse" role="img" aria-label={`Atividade nas últimas 24 horas: ${m.activeHours} de 24 horas com registro`}>
            {m.hours.map((n, h) => <span key={h} data-on={n > 0 || undefined} style={{'--h': n / peak} as CSSProperties}/>)}
          </div>
          <p className="ck-crew-legend" aria-hidden="true"><span>−24 h</span><span>{m.activeHours}/24 h com registro</span><span>agora</span></p>
        </div>
        {m.lastText && <p className="ck-crew-last">{m.lastText}</p>}
        {m.fronts.length > 0 && <ul className="ck-crew-fronts" aria-label="Frentes">{m.fronts.slice(0, 6).map(f => <li key={f} title={f}>{f}</li>)}{m.fronts.length > 6 && <li>+{m.fronts.length - 6}</li>}</ul>}
      </li>;
    })}</ul>
  </div>;
}
