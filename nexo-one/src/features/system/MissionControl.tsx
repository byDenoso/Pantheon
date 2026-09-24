// Controle de missão do Início: o que o NEXO está investigando, o que acabou de
// descobrir e em que revisão da Tower isso foi lido. Linguagem de observatório,
// não de painel: missões com progresso, resultados com significado, telemetria.
import { useMemo, useState } from 'react';
import type { SystemState } from '../../contracts/system.ts';
import { missionsOf, recentResults, telemetryOf, type Mission, type Phase } from '../../viewmodels/missions.ts';
import { dateTime } from '../../viewmodels/tokens.ts';

const PHASE_LABEL: Record<Phase, string> = {
  DONE: 'concluídos', RUNNING: 'em execução', READY: 'prontos', BLOCKED: 'bloqueados', PAUSED: 'pausados',
};

const focusDomain = (domain: string | null) =>
  window.dispatchEvent(new CustomEvent('nexo:domain-focus', { detail: domain }));

function ProgressRing({ value, done, total }: { value: number; done: number; total: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="mc-ring" viewBox="0 0 80 80" role="img" aria-label={`${done} de ${total} testes concluídos`}>
      <circle className="mc-ring-track" cx="40" cy="40" r={radius} />
      <circle className="mc-ring-value" cx="40" cy="40" r={radius}
        strokeDasharray={circumference}
        style={{ ['--mc-offset' as string]: String(circumference * (1 - value)) }} />
      <text x="40" y="38" className="mc-ring-num">{done}</text>
      <text x="40" y="52" className="mc-ring-den">de {total}</text>
    </svg>
  );
}

function MissionCard({ mission, index, onOpen }: { mission: Mission; index: number; onOpen: () => void }) {
  const phases = (['RUNNING', 'READY', 'BLOCKED', 'DONE'] as Phase[]).filter(phase => mission.counts[phase] > 0);
  return (
    <button className="mc-mission" data-domain={mission.domain} onClick={onOpen}
      style={{ ['--mc-i' as string]: String(index) }}
      onMouseEnter={() => focusDomain(mission.domain)} onMouseLeave={() => focusDomain(null)}
      onFocus={() => focusDomain(mission.domain)} onBlur={() => focusDomain(null)}>
      <span className="mc-kicker">{mission.station}</span>
      <div className="mc-mission-body">
        <div>
          <h3>{mission.title}</h3>
          {mission.question && <p className="mc-question">{mission.question}</p>}
        </div>
        <ProgressRing value={mission.progress} done={mission.counts.DONE} total={mission.total} />
      </div>
      <div className="mc-phase-bar" aria-hidden="true">
        {phases.map(phase => (
          <i key={phase} className={`mc-phase phase-${phase.toLowerCase()}`}
            style={{ flexGrow: mission.counts[phase] }} />
        ))}
      </div>
      <p className="mc-phase-legend">
        {phases.map(phase => `${mission.counts[phase]} ${PHASE_LABEL[phase]}`).join(' · ') || 'sem testes publicados'}
      </p>
      {mission.next && (
        <p className="mc-next"><span>PRÓXIMO</span>{mission.next.question ?? mission.next.title}</p>
      )}
    </button>
  );
}

export function MissionControl(
  { state, onOpenScience }: { state: SystemState; onOpenScience: () => void },
) {
  const missions = useMemo(() => missionsOf(state), [state]);
  const results = useMemo(() => recentResults(state), [state]);
  const telemetry = useMemo(() => telemetryOf(state, missions), [state, missions]);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? missions : missions.slice(0, 4);

  if (!missions.length && !results.length) return null;

  return (
    <div className="mission-control">
      <section className="mc-telemetry" aria-label="Telemetria da Tower">
        <span><em>TOWER</em>{telemetry.towerRevision}</span>
        <span><em>LEITURA</em>{dateTime(telemetry.generatedAt)}</span>
        <span><em>MISSÕES</em>{telemetry.missions}</span>
        <span><em>TESTES</em>{telemetry.tests}</span>
        <span className="mc-live"><em>EM EXECUÇÃO</em>{telemetry.running}</span>
        <span><em>PRONTOS</em>{telemetry.ready}</span>
        <span><em>CONCLUÍDOS</em>{telemetry.done}</span>
      </section>

      {missions.length > 0 && (
        <section className="mc-section" aria-labelledby="mc-missions-title">
          <header className="mc-head">
            <span className="mc-eyebrow">OBSERVATÓRIO DE HIPÓTESES</span>
            <h2 id="mc-missions-title">Missões em curso</h2>
          </header>
          <div className="mc-missions">
            {visible.map((mission, index) => (
              <MissionCard key={mission.id} mission={mission} index={index} onOpen={onOpenScience} />
            ))}
            {!expanded && missions.length > visible.length && visible.length % 2 === 0 && (
              <button className="mc-more-tile" onClick={() => setExpanded(true)}>
                <strong>+{missions.length - visible.length}</strong>
                <span>Ver todas as {missions.length} missões →</span>
              </button>
            )}
          </div>
          {missions.length > 4 && (expanded || visible.length % 2 === 1) && (
            <button className="mc-more" onClick={() => setExpanded(value => !value)}>
              {expanded ? 'Mostrar menos' : `Ver todas as ${missions.length} missões`} →
            </button>
          )}
        </section>
      )}

      {results.length > 0 && (
        <section className="mc-section" aria-labelledby="mc-results-title">
          <header className="mc-head">
            <span className="mc-eyebrow">DESCOBERTAS</span>
            <h2 id="mc-results-title">O que os testes disseram</h2>
          </header>
          <ol className="mc-results">
            {results.map((result, index) => (
              <li key={result.id} data-domain={result.domain} style={{ ['--mc-i' as string]: String(index) }}>
                <button onClick={onOpenScience}>
                  <span className="mc-kicker">{result.station}</span>
                  <strong>{result.title}</strong>
                  <p>{result.meaning}</p>
                  {result.missionTitle && <span className="mc-mission-ref">{result.missionTitle} →</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
