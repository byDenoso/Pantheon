// Atlas: mapa estrutural do sistema. Não é um grafo decorativo — cada nó é uma
// entidade projetada, com estado, autoridade e proveniência próprios.
import { useMemo, useState } from 'react';
import type { GraphNode, SystemState } from '../../contracts/system.ts';
import {
  AuthorityClass, CAPABILITY_STATUSES, DOMAINS, GRAPH_NODE_TYPES, PROJECTION_STATES, RELATION_KINDS,
} from '../../contracts/system.ts';
import { EntityInspector } from '../../components/inspector.tsx';
import { EmptyState } from '../../components/states.tsx';
import { DomainBadge, SeverityBadge, StatusBadge } from '../../components/primitives.tsx';
import { useIsMobile } from '../../app/useMediaQuery.ts';
import {
  EMPTY_FILTERS, VIEWBOX, filterCount, filterGraph, layoutGraph, legendOf, relationsOf,
  type GraphFilters, type PlacedNode,
} from '../../viewmodels/graph.ts';
import { label, toneOf } from '../../viewmodels/tokens.ts';

const AUTHORITIES: AuthorityClass[] = ['TRUTH_OWNER', 'DELEGATED', 'DERIVED', 'NON_AUTHORITATIVE'];
const FRESHNESS_VALUES = ['LIVE', 'RECENT', 'AGING', 'STALE', 'UNKNOWN'] as const;

type FilterKey = 'domains' | 'types' | 'states' | 'freshness' | 'authorities' | 'relations';

function ChipGroup<T extends string>(
  { title, values, selected, onToggle }:
  { title: string; values: readonly T[]; selected: T[]; onToggle: (value: T) => void },
) {
  return (
    <div className="chip-group">
      <span className="eyebrow">{title}</span>
      <div className="chip-row">
        {values.map(value => (
          <button key={value} className={`chip${selected.includes(value) ? ' on' : ''}`}
            aria-pressed={selected.includes(value)} onClick={() => onToggle(value)}>
            {label(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphCanvas(
  { nodes, edges, selectedId, onSelect }:
  {
    nodes: PlacedNode[];
    edges: SystemState['graph']['edges'];
    selectedId: string | null;
    onSelect: (id: string) => void;
  },
) {
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const neighbours = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const set = new Set<string>([selectedId]);
    for (const edge of edges) {
      if (edge.from === selectedId) set.add(edge.to);
      if (edge.to === selectedId) set.add(edge.from);
    }
    return set;
  }, [selectedId, edges]);

  return (
    <svg className="atlas-canvas" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} role="group"
      aria-label="Mapa estrutural do sistema">
      <g className="atlas-edges">
        {edges.map(edge => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const dimmed = selectedId ? !(neighbours.has(edge.from) && neighbours.has(edge.to)) : false;
          const critical = edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS';
          return (
            <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={`atlas-edge${critical ? ' critical' : ''}${dimmed ? ' dim' : ''}`}
              strokeWidth={0.6 + edge.weight * 1.4}>
              <title>{`${from.label} ${label(edge.kind)} ${to.label} — ${edge.explanation}`}</title>
            </line>
          );
        })}
      </g>
      <g className="atlas-nodes">
        {nodes.map(node => {
          const dimmed = selectedId ? !neighbours.has(node.id) : false;
          // Rótulo permanente só nas âncoras do mapa. O resto se revela na seleção,
          // senão o centro do grafo vira uma mancha de texto ilegível.
          const anchored = node.type === 'DOMAIN' || node.type === 'PROVIDER';
          const labelled = anchored || (!!selectedId && neighbours.has(node.id));
          return (
            <g key={node.id} className={`atlas-node tone-${toneOf(node.state)} type-${node.type.toLowerCase()}${dimmed ? ' dim' : ''}${node.id === selectedId ? ' selected' : ''}`}
              transform={`translate(${node.x} ${node.y})`} tabIndex={0} role="button"
              aria-label={`${label(node.type)}: ${node.label}. Estado ${label(node.state)}.`}
              onClick={() => onSelect(node.id)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
              {node.type === 'DOMAIN'
                ? <rect x={-node.radius} y={-node.radius} width={node.radius * 2} height={node.radius * 2} rx={6} />
                : <circle r={node.radius} />}
              {node.state === 'CONFLICT' && <circle className="conflict-ring" r={node.radius + 7} />}
              {labelled && (
                <text y={node.radius + 13} textAnchor="middle" className={anchored ? 'anchor-label' : ''}>
                  {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                </text>
              )}
              <title>{node.summary}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function AtlasView(
  { state, filters, setFilters, selectedId, onSelect }:
  {
    state: SystemState;
    filters: GraphFilters;
    setFilters: (next: GraphFilters) => void;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
  },
) {
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  const filtered = useMemo(() => filterGraph(state.graph, filters), [state.graph, filters]);
  const placed = useMemo(() => layoutGraph(filtered.nodes), [filtered.nodes]);
  const legend = useMemo(() => legendOf(filtered.nodes), [filtered.nodes]);
  const selected: GraphNode | null = filtered.nodes.find(n => n.id === selectedId) ?? null;
  const relations = useMemo(
    () => (selectedId ? relationsOf(filtered, selectedId) : { upstream: [], downstream: [] }),
    [filtered, selectedId]);

  const toggle = <K extends FilterKey>(key: K, value: GraphFilters[K][number]) => {
    const current = filters[key] as string[];
    const next = current.includes(value as string)
      ? current.filter(v => v !== value)
      : [...current, value as string];
    setFilters({ ...filters, [key]: next } as GraphFilters);
  };

  const active = filterCount(filters);

  return (
    <div className={`atlas-layout${isMobile ? ' mobile' : ''}`}>
      <div className="atlas-toolbar">
        <div className="atlas-search">
          <span aria-hidden="true">⌕</span>
          <input value={filters.search} placeholder="Filtrar entidades por nome ou resumo"
            aria-label="Buscar no grafo" onChange={e => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <button className={`filter-toggle${active ? ' has-filters' : ''}`} onClick={() => setPanelOpen(v => !v)}
          aria-expanded={panelOpen}>
          Filtros{active > 0 && <b>{active}</b>}
        </button>
        {active > 0 && (
          <button className="text-button" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar</button>
        )}
        <span className="atlas-count">{filtered.nodes.length} nós · {filtered.edges.length} relações</span>
      </div>

      {panelOpen && (
        <div className="atlas-filters">
          <ChipGroup title="DOMÍNIO" values={DOMAINS} selected={filters.domains} onToggle={v => toggle('domains', v)} />
          <ChipGroup title="TIPO" values={GRAPH_NODE_TYPES} selected={filters.types} onToggle={v => toggle('types', v)} />
          <ChipGroup title="ESTADO" values={[...PROJECTION_STATES, ...CAPABILITY_STATUSES]}
            selected={filters.states} onToggle={v => toggle('states', v)} />
          <ChipGroup title="FRESHNESS" values={FRESHNESS_VALUES} selected={filters.freshness} onToggle={v => toggle('freshness', v)} />
          <ChipGroup title="AUTORIDADE" values={AUTHORITIES} selected={filters.authorities} onToggle={v => toggle('authorities', v)} />
          <ChipGroup title="RELAÇÃO" values={RELATION_KINDS} selected={filters.relations} onToggle={v => toggle('relations', v)} />
        </div>
      )}

      <div className="atlas-body">
        <div className="atlas-stage">
          {filtered.nodes.length === 0
            ? <EmptyState title="Nenhuma entidade sobrevive a este filtro."
                description="Um grafo vazio aqui é resultado do filtro, não ausência de dados no sistema."
                hint="Remova um critério para voltar a ver o mapa." />
            : <>
                <GraphCanvas nodes={placed} edges={filtered.edges} selectedId={selectedId} onSelect={onSelect} />
                <ul className="atlas-legend">
                  {legend.map(entry => (
                    <li key={entry.type}>
                      <i aria-hidden="true" className={`legend-dot type-${entry.type.toLowerCase()}`} />
                      {label(entry.type)}<b>{entry.count}</b>
                    </li>
                  ))}
                </ul>
              </>}
        </div>

        {!isMobile && (
          <aside className="atlas-inspector">
            {selected
              ? <EntityInspector node={selected} upstream={relations.upstream} downstream={relations.downstream}
                  onSelect={onSelect} />
              : <div className="inspector-placeholder">
                  <span className="focus-glyph" aria-hidden="true">⌖</span>
                  <h3>Selecione uma entidade.</h3>
                  <p>Cada nó carrega tipo, domínio, estado, autoridade, proveniência e vizinhança navegável.</p>
                </div>}
          </aside>
        )}
      </div>

      {isMobile && selected && (
        <div className="atlas-sheet" role="dialog" aria-label={`Inspector de ${selected.label}`}>
          <EntityInspector node={selected} upstream={relations.upstream} downstream={relations.downstream}
            onSelect={onSelect} onClose={() => onSelect(null)} />
        </div>
      )}
    </div>
  );
}

export function LearningView({ state }: { state: SystemState }) {
  const [kind, setKind] = useState<'ALL' | 'SEMANTIC' | 'PROCEDURAL'>('ALL');
  const filaments = state.filaments
    .filter(f => kind === 'ALL' || f.kind === kind)
    .sort((a, b) => b.weight - a.weight);
  return (
    <>
      <p className="rule-note">
        Filamentos são relações ponderadas entre uma causa observada e um efeito observado — com suporte,
        contradição e um limite explícito de validade. Não são uma rede neural, e peso alto não significa verdade.
      </p>
      <div className="filter-row" role="group" aria-label="Filtrar tipo de memória">
        {(['ALL', 'SEMANTIC', 'PROCEDURAL'] as const).map(value => (
          <button key={value} className={kind === value ? 'filter active' : 'filter'} aria-pressed={kind === value}
            onClick={() => setKind(value)}>
            {value === 'ALL' ? 'Todos' : label(value)}
            <b>{value === 'ALL' ? state.filaments.length : state.filaments.filter(f => f.kind === value).length}</b>
          </button>
        ))}
      </div>
      {filaments.length === 0
        ? <EmptyState title="Nenhum filamento neste filtro." description="A memória é populada a partir de execuções e evidências registradas." />
        : <div className="filament-list">
            {filaments.map(filament => {
              const total = filament.support + filament.contradiction;
              const supportShare = total ? (filament.support / total) * 100 : 0;
              return (
                <article key={filament.id} className={`filament tone-${toneOf(filament.status)}`}>
                  <header>
                    <DomainBadge domain={filament.domain} muted />
                    <StatusBadge state={filament.status} />
                    <span className="filament-kind">{label(filament.kind)}</span>
                    {filament.status === 'CONTESTED' && <SeverityBadge severity="P2" />}
                  </header>
                  <h3>{filament.label}</h3>
                  <div className="filament-relation">
                    <span>{filament.from_label}</span>
                    <span className="filament-arrow" aria-hidden="true">→</span>
                    <span>{filament.to_label}</span>
                  </div>
                  <div className="filament-weight">
                    <div className="weight-bar" role="img"
                      aria-label={`Peso ${filament.weight.toFixed(2)}, ${filament.support} evidências a favor e ${filament.contradiction} contra`}>
                      <i className="support" style={{ width: `${supportShare}%` }} />
                      <i className="contradiction" style={{ width: `${100 - supportShare}%` }} />
                    </div>
                    <span className="weight-value">peso {filament.weight.toFixed(2)}</span>
                    <span className="weight-counts">{filament.support} a favor · {filament.contradiction} contra</span>
                  </div>
                  <p className="filament-boundary"><span className="eyebrow">LIMITE</span>{filament.boundary}</p>
                  <ul className="evidence-list">
                    {filament.evidence.map(ref => <li key={ref}><code className="source-ref">{ref}</code></li>)}
                  </ul>
                </article>
              );
            })}
          </div>}
    </>
  );
}
