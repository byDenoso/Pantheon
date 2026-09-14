import type { MapFilters as MapFilterState } from '../../graph-engine/graph-filters';

// Filters for the map context. Domínio, Status and Autoridade genuinely narrow the
// visible projection (see graph-filters.ts). Fonte is global for this public read
// model, so it is informative rather than interactive: Drive owns state and GitHub
// transports the sanitized projection.
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
      <label className="map-filter-unavailable" title="Fonte global do recorte. O Google Drive é a autoridade de estado; o GitHub transporta apenas a projeção pública sanitizada.">
        <span>Fonte</span>
        <select disabled value="GOOGLE_DRIVE" aria-label="Fonte global: Google Drive">
          <option value="GOOGLE_DRIVE">Google Drive</option>
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
