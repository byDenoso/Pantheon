import { readExecutionIntegrity } from '../../viewmodels/execution-integrity.mjs';

const number = (value: number | null) => value === null ? 'Indisponível' : value.toLocaleString('pt-BR');

export function ExecutionIntegrityPanel({ source }: { source: unknown }) {
  const view = readExecutionIntegrity(source);
  const c = view.counts;
  return (
    <section className="evolution-signals" aria-labelledby="execution-integrity-title" data-testid="execution-integrity">
      <header>
        <div>
          <h3 id="execution-integrity-title">Integridade da execução</h3>
          <p className="evolution-muted">Prontidão, despacho e cálculo são acompanhados separadamente, com a evidência publicada pela Tower.</p>
        </div>
        <span className="evolution-tag">{view.complete ? 'Telemetria publicada' : 'Telemetria incompleta'}</span>
      </header>
      {!view.available ? (
        <p role="status" className="evolution-muted">Esta projeção ainda não publicou a verificação de integridade. As contagens verificadas permanecem indisponíveis.</p>
      ) : (
        <div className="evolution-grid">
          <article className="evolution-card">
            <h4>Prontidão e reserva</h4>
            <p><strong>{number(c.ready_verified)}</strong> com especificação, receita e entradas registradas</p>
            <p className="evolution-muted">{number(c.ready_unverified)} READY sem validação publicada</p>
            <p className="evolution-muted">{number(c.queued)} reservados · {number(c.dispatch_pending)} aguardando confirmação do despacho</p>
          </article>
          <article className="evolution-card">
            <h4>Execução observada</h4>
            <p><strong>{number(c.running_verified)}</strong> com início do cálculo observado</p>
            <p className="evolution-muted">{number(c.running_unverified)} RUNNING sem essa evidência</p>
            <p className="evolution-muted">{number(c.dispatched)} despachos aceitos · {number(c.completed)} resultados concluídos no histórico</p>
          </article>
          <article className="evolution-card">
            <h4>Evidência e comparações</h4>
            <p><strong>{number(c.review_unverified)}</strong> confirmações sem a nova verificação de proveniência registrada</p>
            <p className="evolution-muted">Correção de múltiplas comparações: {number(c.fdr_complete)} anotações completas · {number(c.fdr_incomplete)} incompletas ou antigas.</p>
            <p className="evolution-muted">Os vereditos históricos são preservados. A verificação de proveniência não substitui a avaliação científica.</p>
          </article>
        </div>
      )}
      <p className="evolution-muted">Vazão medida: {view.throughputPerHour === null ? 'ainda indisponível' : `${view.throughputPerHour.toLocaleString('pt-BR')} testes por hora`}. As cotas dos operadores são limites de trabalho por rodada.</p>
    </section>
  );
}
