import type {Architecture} from './api.ts';

// Section "Filas, achados e manuscritos": the 07/11/2026 architecture as the Mural declares it.
// Everything arrives computed by the server from the SHADOW rows; this component only shows it.
const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short'}).format(d) : iso;
};
const GROUP: Record<string, string> = {em_analise: 'em análise', pronto: 'pronto ou candidato', rejeitado: 'rejeitado ou retirado', outro: 'outro'};
const GROUP_TONE: Record<string, 'ok' | 'warn' | 'bad' | undefined> = {em_analise: 'warn', pronto: 'ok', rejeitado: 'bad'};

function Pending({title, rows, empty}: {title: string; rows: Architecture['openRequests']; empty: string}) {
  return <div>
    <h3>{title}</h3>
    {rows.length ? <ul className="ck-arch-list">{rows.map(r => <li key={r.id}><strong>{r.task}</strong> · <span className="mono">{r.id}</span> · {fmt(r.at)}{r.title && <> · {r.title}</>}</li>)}</ul> : <p className="ck-muted">{empty}</p>}
  </div>;
}

export default function CockpitArchitecture({architecture}: {architecture: Architecture | null | undefined}) {
  if (!architecture || !architecture.available) return <p className="ck-note" data-tone="warn">Mural indisponível nesta leitura; filas, placar e cartões não podem ser calculados.</p>;
  const {placar, queues, decisions, manuscripts} = architecture;
  return <div className="ck-arch">
    <p className="ck-crew-summary" aria-label="Placar de achados">
      <span><b>{placar.g3}</b>candidatos que passaram G1–G3</span>
      <span><b>{placar.g4}</b>deles com prior art "não encontrei" (G4)</span>
      <span><b>{placar.g5}</b>cartões de paper (G5)</span>
      <span className="ck-crew-soon">Desde {fmt(placar.since)}. Testes na janela: <b>{placar.tests}</b>, volume que não conta como achado.</span>
    </p>
    <p className="ck-muted">O placar conta linhas únicas por fila do Mural (CANDIDATO_ABERTO e PAPER_CANDIDATO); G4 só enxerga os PRIOR_ART_PRE da janela recente. Os IDs de HIPOTESE_PRE e PRIOR_ART_PRE de cada candidato não são conferidos aqui.</p>

    <h3>Decisões para o Dener</h3>
    {decisions.length ? <ul className="ck-arch-cards">{decisions.map(d => <li key={d.id || d.at} className="ck-panel">
      <p className="ck-meta"><span>{d.task}</span><span>{fmt(d.at)}</span>{d.id && <span>{d.id}</span>}{d.mentions > 0 && <span>{d.mentions} menção(ões) posterior(es) ao ID</span>}</p>
      {d.title && <h4>{d.title}</h4>}
      <p>{d.text}</p>
      {d.link && <a href={d.link} target="_blank" rel="noreferrer noopener">Abrir</a>}
    </li>)}</ul> : <p className="ck-muted">Nenhum cartão DECISAO_DENER desde o início do placar. A Tower não tem marca de resolvida; um cartão fica listado até sair dos últimos 20.</p>}

    <h3>Filas do Mural</h3>
    <div className="ck-panel ck-scroll"><table className="ck-table">
      <caption className="visually-hidden">Linhas por fila do Mural</caption>
      <thead><tr><th>Fila</th><th>Linhas</th><th>Último registro</th></tr></thead>
      <tbody>{queues.map(q => <tr key={q.queue}><td className="mono">{q.queue}</td><td className="mono">{q.count}</td><td className="mono">{fmt(q.last)}</td></tr>)}</tbody>
    </table></div>
    <p className="ck-muted">Janela do Mural: {architecture.windowRows} linhas desde {fmt(architecture.windowFrom)}. CANDIDATO_ABERTO, PAPER_CANDIDATO e DECISAO_DENER vêm também de linhas mais antigas.</p>
    <div className="ck-arch-pending">
      <Pending title="Hipóteses sem prior art citando o ID" rows={architecture.pendingHypotheses} empty="Nenhuma na janela."/>
      <Pending title="Pedidos de ajuda sem linha posterior citando o ID" rows={architecture.openRequests} empty="Nenhum na janela."/>
    </div>

    <h3>Manuscritos</h3>
    {manuscripts.available ? <>
      <p className="ck-crew-summary">{Object.entries(manuscripts.counts).map(([g, n]) => <span key={g} data-tone={GROUP_TONE[g]}><b>{n}</b>{GROUP[g] ?? g}</span>)}</p>
      <div className="ck-panel ck-scroll"><table className="ck-table">
        <thead><tr><th>ID</th><th>Título</th><th>Alvo</th><th>Estado</th><th>Dono</th><th>Próxima ação</th></tr></thead>
        <tbody>{manuscripts.rows.map(r => <tr key={r.id}>
          <td className="mono">{r.id}</td><td>{r.titulo}</td><td>{r.alvo}</td>
          <td><span className="ck-state" data-tone={GROUP_TONE[r.group]}>{GROUP[r.group]}</span><br/>{r.estado}</td>
          <td>{r.dono}{r.needsDener && ' (decisão)'}</td><td>{r.proxima_acao}</td>
        </tr>)}</tbody>
      </table></div>
    </> : <p className="ck-note" data-tone="warn">A aba MANUSCRITOS ainda não existe na Tower ou não foi lida nesta consulta.</p>}
    <p className="ck-muted">{architecture.masterFile ? <a href={architecture.masterFile} target="_blank" rel="noreferrer noopener">Abrir o arquivo mestre (ARQUIVO_MESTRE)</a> : 'Arquivo mestre: o link aparece aqui quando o ID do Drive for registrado.'}</p>
  </div>;
}
