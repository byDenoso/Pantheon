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
  const stale = Date.now() - Date.parse(lab.generatedAt) > 45 * 60_000;
  return <section className="hud-section live-now" aria-labelledby="live-now-title">
    <p className="hud-kicker">Leitura publicada · {ago(lab.generatedAt)}{stale ? ' · atrasada' : ''}</p>
    <h2 id="live-now-title">Acontecendo agora</h2>
    <p className="live-presence"><i className={current.running.length && !stale ? 'is-running' : ''} aria-hidden="true" />{current.running.length ? `${current.running.length} teste${current.running.length === 1 ? '' : 's'} marcado${current.running.length === 1 ? '' : 's'} RUNNING nesta leitura` : 'Nenhum teste marcado RUNNING nesta leitura'}</p>
    {current.running.length > 0 && <ul className="live-work">{current.running.slice(0, 4).map(t => <li key={t.id}>
      <a href={labHref('entidade', t.id)}>{t.name}</a>
      <span>{t.execution?.runner ? `Executor declarado: ${t.execution.runner}` : 'Executor individual não publicado'} · {executionStart(t) ? `registro de execução ${ago(executionStart(t))}` : 'início não publicado'}</span>
    </li>)}</ul>}
    <p className="hud-note">{current.dispatched.length} despachados · {current.queued.length} em QUEUED · {current.ready.length} em READY · {current.blocked.length} bloqueados</p>
    {last && <div className="live-delivery"><span>Última entrega registrada · {ago(last.at)}</span><p><b>{last.role}</b> {eventLabel(last)}{last.entity_id && (lab.tests.has(last.entity_id) || lab.hypotheses.has(last.entity_id)) && <>: <a href={labHref('entidade', last.entity_id)}>{lab.tests.get(last.entity_id)?.name ?? lab.hypotheses.get(last.entity_id)?.statement ?? last.entity_id}</a></>}</p></div>}
    {!last && <p className="hud-note">Nenhuma entrega detalhada publicada no histórico recebido.</p>}
    {current.ready.length > 0 && <details><summary>Próximos candidatos publicados ({current.ready.length})</summary><ul className="live-work">{current.ready.slice(0, 4).map(t => <li key={t.id}><a href={labHref('entidade', t.id)}>{t.name}</a><span>{readinessLabel(t)}</span></li>)}</ul><a href="#/evidencia?v=READY">Consultar fila completa →</a></details>}
    <p className="live-cadence">Atualização por consulta: verifica novas publicações a cada 20 s enquanto a página está visível. Os estados descrevem o snapshot recebido; publicação e execução têm relógios próprios.</p>
  </section>;
}
