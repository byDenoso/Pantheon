import { useMemo, useState } from 'react';
import { buildTableRows, filterAndAutoExpand, sortRows, toggleDomainExpansion, type SortDirection, type SortKey } from './accessible-table-model';
import type { GraphProjection } from './types';

const STATUS_OPTIONS = ['READY', 'CHECKPOINTED', 'WAIT_DEPENDENCY', 'BLOCKED'];

/**
 * Accessible fallback for the 3D map: a real <table>, keyboard/screen-reader
 * navigable, with full functional parity to the map -- search, status filter,
 * selection (opens the same inspector via onSelect), and drill-down (expanding a
 * domain row reveals its campaigns, mirroring "focusing" a domain in the 3D scene).
 * Consumes the exact same GraphProjection the map would have rendered (already passed
 * through enforceGraphEntityContract upstream), so parity is structural, not
 * approximate.
 */
export function AccessibleGraphTable({
  projection,
  selectedId,
  onSelect
}: {
  projection: GraphProjection;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('label');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { rows } = useMemo(
    () => filterAndAutoExpand(projection.nodes, projection.edges, expanded, { query, status: status || undefined }),
    [projection.nodes, projection.edges, expanded, query, status]
  );
  const sortedRows = useMemo(() => sortRows(rows, sortKey, sortDirection), [rows, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDirection(direction => (direction === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const activateRow = (id: string, type: 'DOMAIN' | 'CAMPAIGN') => {
    if (type === 'DOMAIN') setExpanded(current => toggleDomainExpansion(current, id));
    onSelect(id);
  };

  return (
    <div className="accessible-graph-table" role="region" aria-label="Mapa de conhecimento (tabela acessível)">
      <div className="accessible-graph-table-toolbar">
        <label>
          Buscar
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar domínio ou campanha" placeholder="Nome ou id…" />
        </label>
        <label>
          Status
          <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filtrar por status">
            <option value="">Todos</option>
            {STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table>
        <caption className="sr-only">Domínios e campanhas visíveis no recorte atual. Selecione uma linha para abrir o inspector; domínios podem ser expandidos.</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={sortKey === 'label' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" onClick={() => toggleSort('label')}>
                Nome
              </button>
            </th>
            <th scope="col" aria-sort={sortKey === 'type' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" onClick={() => toggleSort('type')}>
                Tipo
              </button>
            </th>
            <th scope="col" aria-sort={sortKey === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" onClick={() => toggleSort('status')}>
                Status
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={3}>Nenhum resultado para os filtros atuais.</td>
            </tr>
          )}
          {sortedRows.map(row => (
            <tr key={row.id} className={row.isChildRow ? 'accessible-table-child-row' : undefined} aria-selected={row.id === selectedId}>
              <td>
                <button type="button" onClick={() => activateRow(row.id, row.type)} aria-expanded={row.type === 'DOMAIN' ? expanded.has(row.id) : undefined}>
                  {row.type === 'DOMAIN' && <span aria-hidden="true">{expanded.has(row.id) ? '▾' : '▸'} </span>}
                  {row.isChildRow && <span aria-hidden="true">↳ </span>}
                  {row.label}
                </button>
              </td>
              <td>{row.type === 'DOMAIN' ? 'Domínio' : 'Campanha'}</td>
              <td>{row.status || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
