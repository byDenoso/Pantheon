// Controle de missão do Início: o que o NEXO está investigando, o que acabou de
// descobrir e em que revisão da Tower isso foi lido. Linguagem de observatório,
// não de painel: missões com progresso, resultados com significado, telemetria.
import { useMemo, useState } from 'react';
import type { SystemState } from '../../contracts/system.ts';
import { missionsOf, recentResults, telemetryOf, type Mission, type Phase } from '../../viewmodels/missions.ts';
import { dateTime, humanizeText } from '../../viewmodels/tokens.ts';

const PHASE_LABEL: Record<Phase, string> = {
  DONE: 'concluídos', RUNNING: 'em execução', READY: 'prontos', BLOCKED: 'bloqueados', PAUSED: 'pausados',
};

const isTechnicalText = (value?: string | null) => {
  const text = String(value ?? '').trim();
  return /^(?:CAMP|TEST|RM|REQ|EVT|HYP|WORK|ACTION)[-_:]/i.test(text)
    || /^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/.test(text)
    || /^[A-Z]{1,4}\d{1,4}$/.test(text)
    || /^[A-Z]{1,5}[-_]\d{1,}$/.test(text)
    || /^[a-f0-9]{16,}$/i.test(text)
    || /^[a-z]+::/i.test(text);
};
const plainText = (value: string | null | undefined, fallback: string) =>
  !value || isTechnicalText(value) ? fallback : humanizeText(value);

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
  const nextStep = mission.next?.question ?? mission.next?.title;
  return (
    <button className="mc-mission" data-domain={mission.domain} onClick={onOpen}
      style={{ ['--mc-i' as string]: String(index) }}
      onMouseEnter={() => focusDomain(mission.domain)} onMouseLeave={() => focusDomain(null)}
      onFocus={() => focusDomain(mission.domain)} onBlur={() => focusDomain(null)}>
      <span className="mc-kicker">{plainText(mission.station, 'Área de estudo')}</span>
      <div className="mc-mission-body">
        <div>
          <h3>{plainText(mission.title, 'Estudo registrado')}</h3>
          {mission.question && <p className="mc-question">{plainText(mission.question, 'Pergunta registrada; descrição simples indisponível.')}</p>}
        </div>
        <ProgressRing value={mission.progress} done={mission.counts.DONE} total={mission.total} />
      </div>
      <p>O círculo mostra quantos testes foram concluídos; a faixa abaixo distribui os testes por situação.</p>
      <div className="mc-phase-bar" aria-hidden="true">
        {phases.map(phase => (
          <i key={phase} className={`mc-phase phase-${phase.toLowerCase()}`}
            style={{ flexGrow: mission.counts[phase] }} />
        ))}
      </div>
      <p className="mc-phase-legend">
        {phases.map(phase => `${mission.counts[phase]} ${PHASE_LABEL[phase]}`).join(' · ') || 'sem testes publicados'}
      </p>
      {mission.next && nextStep && !isTechnicalText(nextStep) && (
        <p className="mc-next"><span>PRÓXIMA ETAPA</span>{plainText(nextStep, '')}</p>
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
      <p>Estudos são frentes de pesquisa; testes são as verificações registradas. Os totais contam esses registros; os números seguintes mostram quantos estão em execução, prontos ou concluídos.</p>
      <section className="mc-telemetry" aria-label="Resumo dos estudos, testes e sua atualização">
        <span><em>REVISÃO DA FONTE</em><details><summary>Ver identificador técnico</summary><code>{telemetry.towerRevision}</code></details></span>
        <span><em>DADOS ATUALIZADOS</em>{dateTime(telemetry.generatedAt)}</span>
        <span><em>ESTUDOS</em>{telemetry.missions}</span>
        <span><em>TESTES REGISTRADOS</em>{telemetry.tests}</span>
        <span className="mc-live"><em>EM EXECUÇÃO</em>{telemetry.running}</span>
        <span><em>PRONTOS</em>{telemetry.ready}</span>
        <span><em>CONCLUÍDOS</em>{telemetry.done}</span>
      </section>

      {missions.length > 0 && (
        <section className="mc-section" aria-labelledby="mc-missions-title">
          <header className="mc-head">
            <span className="mc-eyebrow">ESTUDOS CIENTÍFICOS</span>
            <h2 id="mc-missions-title">Estudos acompanhados</h2>
            <p>Cada cartão resume a pergunta de um estudo e o andamento dos testes associados.</p>
          </header>
          <div className="mc-missions">
            {visible.map((mission, index) => (
              <MissionCard key={mission.id} mission={mission} index={index} onOpen={onOpenScience} />
            ))}
            {!expanded && missions.length > visible.length && visible.length % 2 === 0 && (
              <button className="mc-more-tile" onClick={() => setExpanded(true)}>
                <strong>+{missions.length - visible.length}</strong>
                <span>Ver todos os {missions.length} estudos →</span>
              </button>
            )}
          </div>
          <details>
            <summary>Identificadores e textos técnicos dos estudos</summary>
            <ul>
              {missions.map(mission => (
                <li key={mission.id}>
                  <code>{mission.id}</code>
                  {isTechnicalText(mission.title) && <span> · Título: <code>{mission.title}</code></span>}
                  {isTechnicalText(mission.station) && <span> · Área: <code>{mission.station}</code></span>}
                  {isTechnicalText(mission.question) && <span> · Pergunta: <code>{mission.question}</code></span>}
                  {mission.next && isTechnicalText(mission.next.question ?? mission.next.title) && <span> · Próxima etapa: <code>{mission.next.question ?? mission.next.title}</code></span>}
                </li>
              ))}
            </ul>
          </details>
          {missions.length > 4 && (expanded || visible.length % 2 === 1) && (
            <button className="mc-more" onClick={() => setExpanded(value => !value)}>
              {expanded ? 'Mostrar menos' : `Ver todos os ${missions.length} estudos`} →
            </button>
          )}
        </section>
      )}

      {results.length > 0 && (
        <section className="mc-section" aria-labelledby="mc-results-title">
          <header className="mc-head">
            <span className="mc-eyebrow">RESULTADOS RECENTES</span>
            <h2 id="mc-results-title">O que os testes indicam</h2>
            <p>Resumo em linguagem simples dos testes concluídos. Selecione um resultado para abrir a área de ciência e consultar os registros.</p>
          </header>
          <ol className="mc-results">
            {results.map((result, index) => (
              <li key={result.id} data-domain={result.domain} style={{ ['--mc-i' as string]: String(index) }}>
                <button onClick={onOpenScience}>
                  <span className="mc-kicker">{plainText(result.station, 'Área de estudo')}</span>
                  <strong>{plainText(result.title, 'Resultado registrado')}</strong>
                  <p>{plainText(result.meaning, 'Resultado registrado; explicação simples indisponível.')}</p>
                  {result.missionTitle && <span className="mc-mission-ref">{plainText(result.missionTitle, 'Estudo relacionado')} →</span>}
                </button>
                {(isTechnicalText(result.title) || isTechnicalText(result.station) || isTechnicalText(result.meaning) || isTechnicalText(result.missionTitle) || result.id) && (
                  <details>
                    <summary>Detalhes técnicos</summary>
                    <dl>
                      <div><dt>Identificador do resultado</dt><dd><code>{result.id}</code></dd></div>
                      {isTechnicalText(result.title) && <div><dt>Título publicado</dt><dd><code>{result.title}</code></dd></div>}
                      {isTechnicalText(result.station) && <div><dt>Área publicada</dt><dd><code>{result.station}</code></dd></div>}
                      {isTechnicalText(result.meaning) && <div><dt>Texto publicado</dt><dd><code>{result.meaning}</code></dd></div>}
                      {isTechnicalText(result.missionTitle) && <div><dt>Estudo relacionado</dt><dd><code>{result.missionTitle}</code></dd></div>}
                    </dl>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
