import type {SelectionFilter} from './workspace.ts';
export function CandidateControls({label, query, setQuery, filter, setFilter, states, state = '', setState}: {
  label: string; query: string; setQuery: (s: string) => void; filter: SelectionFilter; setFilter: (s: SelectionFilter) => void;
  states?: string[]; state?: string; setState?: (s: string) => void;
}) {
  return <div className="ck-workspace-toolbar">
    <label className="ck-control"><span>Buscar {label}</span><input className="ck-search" type="search" placeholder="Título, resultado ou contexto…" value={query} onChange={e => setQuery(e.target.value)}/></label>
    <label className="ck-control"><span>Seleção pública</span><select value={filter} onChange={e => setFilter(e.target.value as SelectionFilter)}>
      <option value="all">Todos os itens</option><option value="private">Fora do rascunho público</option><option value="selected">Selecionados no rascunho</option><option value="changed">Fonte alterada</option>
    </select></label>
    {states && setState && <label className="ck-control"><span>Estado na SHADOW</span><select value={state} onChange={e => setState(e.target.value)}><option value="">Todos os estados</option>{states.map(s => <option key={s}>{s}</option>)}</select></label>}
  </div>;
}
export function Pager({page, pages, total, setPage, label}: {page: number; pages: number; total: number; setPage: (n: number) => void; label: string}) {
  return <nav className="ck-pager" aria-label={`Paginação de ${label}`}><span role="status">{total} {total === 1 ? 'item' : 'itens'} · página {page} de {pages}</span><div><button className="ck-btn quiet" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button className="ck-btn quiet" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button></div></nav>;
}
