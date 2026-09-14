import type { MapFilters as MapFilterState } from '../../graph-engine/graph-filters';

// Filters for the map context. Domínio, Status and Autoridade genuinely narrow the
// visible projection (see graph-filters.ts) -- they are wired to real fields on real
// nodes, not decorative. Fonte has no per-node source value anywhere in the current
// data pipeline (every node in the static snapshot carries the same fixed
// GOOGLE_DRIVE/GITHUB pipeline provenance, not a per-entity source to filter across),
// so it renders disabled with an honest reason instead of a fake option list.
export function MapFilters({
  filters,
  domainOptions,
  statusOptions,
  authorityOptions,
  onChange,
  onClear
}: {
  filters: MapFilterState;
  domainOptions: string[];
  statusOptions: string[];
  authorityOptions: string[];
  onChange: (patch: MapFilterState) => void;
  onClear: () => void;
}) {
  const active = Boolean(filters.domain || filters.status || filters.authority);
  return (
    <div className="map-filters" role="group" aria-label="Filtros do mapa">
      <label>
        <span>Domínio</span>
        <select value={filters.domain || ''} onChange={event => onChange({ ...filters, domain: event.target.value || undefined })}>
          <option value="">Todos</option>
          {domainOptions.map(value => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select value={filters.status || ''} onChange={event => onChange({ ...filters, status: event.target.value || undefined })}>
          <option value="">Todos</option>
          {statusOptions.map(value => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Autoridade</span>
        <select value={filters.authority || ''} onChange={event => onChange({ ...filters, authority: event.target.value || undefined })}>
          <option value="">Todas</option>
          {authorityOptions.map(value => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="map-filter-unavailable" title="Nenhuma fonte por entidade é publicada neste snapshot -- todo o recorte usa a mesma proveniência (GOOGLE_DRIVE/GITHUB).">
        <span>Fonte</span>
        <select disabled value="">
          <option value="">Indisponível</option>
        </select>
      </label>
      {active && (
        <button type="button" className="map-filter-clear" onClick={onClear}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}
