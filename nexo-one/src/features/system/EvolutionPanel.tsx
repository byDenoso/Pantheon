// Ciclo fechado do NEXO: o que ele está pensando, o que espera do Dener, e o quanto cada roadmap anda até parar.
import type { EvolutionStatus } from '../../contracts/system.ts';
import { humanizeText } from '../../viewmodels/tokens.ts';
import { ExecutionIntegrityPanel } from './ExecutionIntegrityPanel.tsx';

const KIND_PT: Record<string, string> = {
  SURPRISE: 'Surpresa', QUESTION: 'Pergunta', DREAM: 'Sonho', SELF_PREDICTION: 'Autoprevisão',
  CRISIS: 'Crise', SENTINEL: 'Sentinela',
};
const STOP_PT: Record<string, string> = { SUCCESS: 'Meta alcançada', KILL: 'Limite de refutações atingido', BUDGET: 'Limite de testes atingido' };
const SIGNAL_COPY_PT: Record<string, { title: string; explanation: string }> = {
  READY_INPUTS_NOT_MATERIALIZED: {
    title: 'Resultados prontos ainda não foram aproveitados',
    explanation: 'A automação encontrou entradas prontas, mas elas ainda não viraram uma próxima etapa de trabalho.',
  },
  EMPTY_FRONTIER_ACTIVE_ROADMAP: {
    title: 'Roteiro ativo sem próximo teste',
    explanation: 'Há um estudo em andamento, mas nenhum teste está pronto para começar agora.',
  },
  RUNNER_ARTIFACT_EXECUTOR_UNAVAILABLE: {
    title: 'Executor de testes indisponível',
    explanation: 'A automação não conseguiu iniciar o executor que roda os testes. Isso é uma falha operacional, não um resultado científico.',
  },
};
const SOURCE_PT: Record<string, string> = { AUTOMATION: 'automações', CONVERSATION: 'conversas' };

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return '';
  return minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.round(minutes / 60)} h` : `há ${Math.round(minutes / 1440)} d`;
};

export function EvolutionPanel({ evolution }: { evolution: EvolutionStatus & { execution_integrity?: unknown } }) {
  const thoughts = [...(evolution.thoughts ?? [])].reverse().slice(0, 4);
  const gate = evolution.gate.charters_waiting.length + evolution.gate.canaries_waiting.length;
  const reviews = evolution.reviews ?? {};
  const underReview = (reviews.PENDING_REVIEW ?? 0) + (reviews.CONTESTED ?? 0) + (reviews.REFEREE1_PASSED ?? 0);
  const { decoys } = evolution;
  const signalClusters = evolution.signal_clusters ?? [];

  return (
    <section className="evolution" aria-labelledby="evolution-title" data-order="evolution">
      <header className="evolution-head">
        <p className="evolution-kicker">Ciclo de aprendizagem · edição {evolution.genome.generation}</p>
        <h2 id="evolution-title">O que o NEXO está aprendendo</h2>
        <p className="evolution-muted">Acompanhe o que foi observado, o que ainda está em avaliação e quais decisões precisam de você.</p>
      </header>

      <ExecutionIntegrityPanel source={evolution.execution_integrity} />

      {thoughts.length > 0 && (
        <ol className="evolution-thoughts">
          {thoughts.map(thought => (
            <li key={thought.id}>
              <span className="evolution-tag">{KIND_PT[thought.kind] ?? 'Atualização'}</span>
              <p>{humanizeText(thought.text)}</p>
              <small>{ago(thought.at)}</small>
              {thought.refs.length > 0 && <details className="evolution-technical">
                <summary>Referências técnicas ({thought.refs.length})</summary>
                <code>{thought.refs.join(' · ')}</code>
              </details>}
            </li>
          ))}
        </ol>
      )}

      {signalClusters.length > 0 && (
        <div className="evolution-signals" aria-labelledby="evolution-signals-title">
          <header>
            <div>
              <h3 id="evolution-signals-title">Padrões em observação</h3>
              <p className="evolution-muted">Quando automações percebem o mesmo tipo de obstáculo várias vezes, o NEXO reúne os sinais para investigar. Esta observação não altera regras nem executa mudanças sozinha.</p>
            </div>
            <span className="evolution-tag" title="Os sinais são acompanhados sem alterar o funcionamento do sistema.">Apenas observação</span>
          </header>
          <ul>
            {signalClusters.map(cluster => {
              const tests = cluster.test_ids ?? [];
              const sources = cluster.sources.map(source => SOURCE_PT[source] ?? 'outras fontes').join(' · ');
              const lastSeen = cluster.last_seen ? ago(cluster.last_seen) : '';
              const copy = SIGNAL_COPY_PT[cluster.code];
              return (
                <li key={cluster.cluster_id}>
                  <div className="evolution-signal-head">
                    <strong>{copy?.title ?? 'Sinal recorrente em avaliação'}</strong>
                    <span>{cluster.occurrences} {cluster.occurrences === 1 ? 'vez observada' : 'vezes observadas'}</span>
                  </div>
                  <p className="evolution-muted">{copy?.explanation ?? 'O mesmo tipo de ocorrência apareceu mais de uma vez. O significado ainda está sendo investigado.'}</p>
                  <small>
                    Observado em {sources || 'fonte ainda não identificada'}
                    {lastSeen ? ` · última vez ${lastSeen}` : ''}
                  </small>
                  {(tests.length > 0 || cluster.code) && <details className="evolution-technical">
                    <summary>Detalhes técnicos</summary>
                    {cluster.code && <p><span>Código interno</span><code>{cluster.code}</code></p>}
                    {tests.length > 0 && <p><span>Registros de teste</span><code>{tests.join(' · ')}</code></p>}
                  </details>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="evolution-grid">
        <article className={gate ? 'evolution-card attention' : 'evolution-card'}>
          <h3>Decisões que esperam por você</h3>
          <p className="evolution-muted">O NEXO para neste ponto quando uma escolha humana é necessária.</p>
          {gate === 0 && <p className="evolution-muted">Nenhuma decisão pendente.</p>}
          {evolution.gate.charters_waiting.map(charter => (
            <div key={charter.roadmap_id} className="evolution-charter">
              <p><strong>{charter.renewable ? 'Estudo contínuo' : 'Proposta de estudo'}</strong> {humanizeText(charter.question) || 'A pergunta ainda não foi publicada.'}</p>
              {charter.objectives?.length ? <ul>{charter.objectives.map(o => <li key={o}>{humanizeText(o)}</li>)}</ul> : null}
              <details className="evolution-technical"><summary>Identificador do estudo</summary><code>{charter.roadmap_id}</code></details>
            </div>
          ))}
          {evolution.gate.canaries_waiting.map(canary => (
            <div key={canary.gene} className="evolution-charter">
              <p><strong>Alteração isolada pronta para revisão</strong></p>
              <p className="evolution-muted">Esta mudança foi testada separadamente. Revise antes de incorporá-la ao funcionamento geral do NEXO.</p>
              <details className="evolution-technical"><summary>Ver a configuração técnica</summary><code>{canary.gene} → {JSON.stringify(canary.canary)}</code></details>
            </div>
          ))}
        </article>

        <article className="evolution-card">
          <h3>Avaliação das conclusões</h3>
          <p className="evolution-muted">Confirmações registradas na Tower. A cobertura da verificação de proveniência aparece no painel de integridade.</p>
          <p className="evolution-big">{reviews.CONFIRMED ?? 0}<span> confirmadas</span></p>
          <p className="evolution-muted">
            {underReview} em revisão · {reviews.REFUTED ?? 0} refutadas
          </p>
        </article>

        <article className="evolution-card">
          <h3>Testes contra respostas enganosas</h3>
          <p className="evolution-big">{decoys.revealed ? `${decoys.caught}/${decoys.revealed}` : decoys.planted}<span>{decoys.revealed ? ' reconhecidas' : ' preparadas'}</span></p>
          <p className="evolution-muted">O NEXO recebe exemplos deliberadamente incorretos para verificar se consegue identificá-los.</p>
        </article>
      </div>

      {evolution.roadmaps.length > 0 && (
        <ul className="evolution-roadmaps" aria-label="Progresso dos estudos">
          {evolution.roadmaps.map(roadmap => {
            const target = roadmap.success_target ?? 0;
            const pct = target ? Math.min(100, Math.round((roadmap.confirmed / target) * 100)) : 0;
            const used = roadmap.max_tests ? Math.min(100, Math.round((roadmap.tests_used / roadmap.max_tests) * 100)) : 0;
            const remaining = target ? Math.max(0, target - roadmap.confirmed) : null;
            const question = humanizeText(evolution.charters?.find(c => c.roadmap_id === roadmap.roadmap_id)?.question);
            return (
              <li key={roadmap.roadmap_id}>
                <div className="evolution-rm-head">
                  <span className="evolution-rm">{question || 'Estudo em andamento'}</span>
                  <span className="evolution-rm-next">
                    {remaining === null ? 'alvo não publicado' : remaining === 0 ? 'alvo alcançado' : `faltam ${remaining} confirmaç${remaining === 1 ? 'ão' : 'ões'}`}
                  </span>
                </div>
                <div className="evolution-progress">
                  <div>
                    <span><b>Conclusões confirmadas</b><em>{roadmap.confirmed}/{target || '?'}</em></span>
                    <span className="evolution-bar confirmations" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  </div>
                  <div>
                    <span><b>Testes realizados</b><em>{roadmap.tests_used}/{roadmap.max_tests ?? '?'}</em></span>
                    <span className="evolution-bar tests" aria-hidden="true"><i style={{ width: `${used}%` }} /></span>
                  </div>
                </div>
                {roadmap.stop_reached && <span className="evolution-rm-meta">{STOP_PT[roadmap.stop_reached] ?? 'Critério de encerramento atingido'}</span>}
                <details className="evolution-technical"><summary>Identificador do estudo</summary><code>{roadmap.roadmap_id}</code></details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
