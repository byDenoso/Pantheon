// Ciclo fechado do NEXO: o que ele está pensando, o que espera do Dener, e o quanto cada roadmap anda até parar.
import type { EvolutionStatus } from '../../contracts/system.ts';

const KIND_PT: Record<string, string> = {
  SURPRISE: 'Surpresa', QUESTION: 'Pergunta', DREAM: 'Sonho', SELF_PREDICTION: 'Autoprevisão',
  CRISIS: 'Crise', SENTINEL: 'Sentinela',
};
const STOP_PT: Record<string, string> = { SUCCESS: 'meta atingida', KILL: 'refutações demais', BUDGET: 'orçamento esgotado' };

const short = (id: string) => id.replace(/^RM-/, '').replace(/-20\d{6}-V\d+$/, '').replace(/-V\d+$/, '').replace(/-/g, ' ');
const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return '';
  return minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.round(minutes / 60)} h` : `há ${Math.round(minutes / 1440)} d`;
};

export function EvolutionPanel({ evolution }: { evolution: EvolutionStatus }) {
  const thoughts = [...(evolution.thoughts ?? [])].reverse().slice(0, 4);
  const gate = evolution.gate.charters_waiting.length + evolution.gate.canaries_waiting.length;
  const reviews = evolution.reviews ?? {};
  const underReview = (reviews.PENDING_REVIEW ?? 0) + (reviews.CONTESTED ?? 0) + (reviews.REFEREE1_PASSED ?? 0);
  const { decoys } = evolution;

  return (
    <section className="evolution" aria-labelledby="evolution-title" data-order="evolution">
      <header className="evolution-head">
        <p className="evolution-kicker">Ciclo fechado · geração {evolution.genome.generation}</p>
        <h2 id="evolution-title">O que o NEXO está pensando</h2>
      </header>

      {thoughts.length > 0 && (
        <ol className="evolution-thoughts">
          {thoughts.map(thought => (
            <li key={thought.id}>
              <span className="evolution-tag">{KIND_PT[thought.kind] ?? thought.kind}</span>
              <p>{thought.text}</p>
              <small>
                {ago(thought.at)} · {thought.refs.slice(0, 3).map(short).join(' · ')}
                {thought.refs.length > 3 ? ` +${thought.refs.length - 3}` : ''}
              </small>
            </li>
          ))}
        </ol>
      )}

      <div className="evolution-grid">
        <article className={gate ? 'evolution-card attention' : 'evolution-card'}>
          <h3>Portão do Dener</h3>
          {gate === 0 && <p className="evolution-muted">Nada esperando decisão.</p>}
          {evolution.gate.charters_waiting.map(charter => (
            <div key={charter.roadmap_id} className="evolution-charter">
              <p><strong>{charter.renewable ? 'Campanha permanente' : 'Carta'}</strong> {charter.question ?? short(charter.roadmap_id)}</p>
              {charter.objectives?.length ? <ul>{charter.objectives.map(o => <li key={o}>{o}</li>)}</ul> : null}
            </div>
          ))}
          {evolution.gate.canaries_waiting.map(canary => (
            <p key={canary.gene}><strong>Canonizar</strong> {canary.gene} → {JSON.stringify(canary.canary)}</p>
          ))}
        </article>

        <article className="evolution-card">
          <h3>Resultados sob refutação</h3>
          <p className="evolution-big">{reviews.CONFIRMED ?? 0}<span> confirmados</span></p>
          <p className="evolution-muted">
            {underReview} em revisão · {reviews.REFUTED ?? 0} refutados · só confirma quem sobrevive a 2 contestações
          </p>
        </article>

        <article className="evolution-card">
          <h3>Iscas plantadas</h3>
          <p className="evolution-big">{decoys.revealed ? `${decoys.caught}/${decoys.revealed}` : decoys.planted}<span>{decoys.revealed ? ' detectadas' : ' plantadas, ainda secretas'}</span></p>
          <p className="evolution-muted">O NEXO tenta enganar a si mesmo para provar que não se deixa enganar.</p>
        </article>
      </div>

      {evolution.roadmaps.length > 0 && (
        <ul className="evolution-roadmaps" aria-label="Progresso até o critério de parada">
          {evolution.roadmaps.map(roadmap => {
            const target = roadmap.success_target ?? 0;
            const pct = target ? Math.min(100, Math.round((roadmap.confirmed / target) * 100)) : 0;
            const used = roadmap.max_tests ? Math.min(100, Math.round((roadmap.tests_used / roadmap.max_tests) * 100)) : 0;
            const remaining = target ? Math.max(0, target - roadmap.confirmed) : null;
            const question = evolution.charters?.find(c => c.roadmap_id === roadmap.roadmap_id)?.question;
            return (
              <li key={roadmap.roadmap_id}>
                <div className="evolution-rm-head">
                  <span className="evolution-rm">{short(roadmap.roadmap_id)}</span>
                  <span className="evolution-rm-next">
                    {remaining === null ? 'meta sem alvo numérico' : remaining === 0 ? 'meta atingida' : `faltam ${remaining} confirmaç${remaining === 1 ? 'ão' : 'ões'}`}
                  </span>
                </div>
                {question && <span className="evolution-rm-question">{question}</span>}
                <div className="evolution-progress">
                  <div>
                    <span><b>Confirmações</b><em>{roadmap.confirmed}/{target || '?'}</em></span>
                    <span className="evolution-bar confirmations" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  </div>
                  <div>
                    <span><b>Testes usados</b><em>{roadmap.tests_used}/{roadmap.max_tests ?? '?'}</em></span>
                    <span className="evolution-bar tests" aria-hidden="true"><i style={{ width: `${used}%` }} /></span>
                  </div>
                </div>
                {roadmap.stop_reached && <span className="evolution-rm-meta">parada: {STOP_PT[roadmap.stop_reached] ?? roadmap.stop_reached}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
