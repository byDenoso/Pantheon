import { isPublishedFresh } from '../../viewmodels/published-time.ts';
import { useEffect, useState } from 'react';
import type { Lab } from './model.ts';
import { ago } from './model.ts';
import { labHref } from './routes.ts';
import { eventLabel, executionNow, executionStart, latestDelivery } from './live-state.ts';
import { readinessLabel } from './presentation.ts';

export function LiveNowPanel({ lab }: { lab: Lab }) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick(n => n + 1), 30_000); return () => window.clearInterval(timer); }, []);
  const current = executionNow(lab);
  const last = latestDelivery(lab);
  const review = [...lab.tests.values()].filter(t => t.verdict === 'REVIEW').length;
  const saved = [...lab.tests.values()].filter(t => t.verdict === 'CHECKPOINTED').length;
  const stale = !isPublishedFresh(lab.generatedAt);
  return <section className="hud-section live-now" aria-labelledby="live-now-title">
    <p className="hud-kicker">Leitura publicada · {ago(lab.generatedAt)}{stale ? ' · frescor não validado' : ''}</p>
    <h2 id="live-now-title">Acontecendo agora</h2>
    <p className="live-presence"><i className={current.running.length && !stale ? 'is-running' : ''} aria-hidden="true" />{current.running.length} RUNNING publicados</p>
    {current.running.length > 0 && <ul className="live-work">{current.running.slice(0, 4).map(t => <li key={t.id}>
      <a href={labHref('entidade', t.id)}>{t.name}</a>
      <span>{t.execution?.runner ? `Executor: ${t.execution.runner}` : 'Executor não publicado'} · {executionStart(t) ? `execução ${ago(executionStart(t))}` : 'início não publicado'}</span>
    </li>)}</ul>}
    <dl className="live-queue">{[
      [current.ready.length, 'READY'], [current.queued.length, 'QUEUED'], [current.dispatched.length, 'Despachados'],
      [review, 'Em revisão'], [saved, 'Salvos'], [current.blocked.length, 'Bloqueados'],
    ].map(([count, label]) => <div key={label}><dt>{count}</dt><dd>{label}</dd></div>)}</dl>
    {last && <div className="live-delivery"><span>Última entrega registrada · {ago(last.at)}</span><p><b>{last.role}</b> {eventLabel(last)}{last.entity_id && (lab.tests.has(last.entity_id) || lab.hypotheses.has(last.entity_id)) && <>: <a href={labHref('entidade', last.entity_id)}>{lab.tests.get(last.entity_id)?.name ?? lab.hypotheses.get(last.entity_id)?.statement ?? last.entity_id}</a></>}</p></div>}
    {!last && <p className="hud-note">Nenhuma entrega detalhada publicada no histórico recebido.</p>}
    {current.ready.length > 0 && <details><summary>Próximos candidatos publicados ({current.ready.length})</summary><ul className="live-work">{current.ready.slice(0, 4).map(t => <li key={t.id}><a href={labHref('entidade', t.id)}>{t.name}</a><span>{readinessLabel(t)}</span></li>)}</ul><a href="#/evidencia?v=READY">Consultar fila completa →</a></details>}
    <details className="reading-details"><summary>Sobre esta leitura</summary><p className="hud-note">Estoque por estado do snapshot. A capacidade de execução e revisão precisa ser declarada pelo backend; essas contagens não definem um lote.</p><p className="live-cadence">Consulta novas publicações a cada 20 s com a página visível. A hora da publicação não é a hora da execução.</p></details>
  </section>;
}
