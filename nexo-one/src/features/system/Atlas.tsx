// Atlas: mapas projetados do mesmo SystemState. Nenhuma visualização é Truth Owner.
import { useEffect, useMemo, useState } from 'react';
import type { GraphNode, SystemState } from '../../contracts/system.ts';
import type { WorldState } from '../../contracts/world.ts';
import {
  AuthorityClass, CAPABILITY_STATUSES, DOMAINS, GRAPH_NODE_TYPES, PROJECTION_STATES, RELATION_KINDS,
} from '../../contracts/system.ts';
import { Atlas3DCanvas } from '../../components/Atlas3DCanvas.tsx';
import { EntityInspector } from '../../components/inspector.tsx';
import { EmptyState } from '../../components/states.tsx';
import { DomainBadge, SeverityBadge, StatusBadge } from '../../components/primitives.tsx';
import { useIsMobile } from '../../app/useMediaQuery.ts';
import { atlasModeFromHash, hashForView } from '../../app/navigation.ts';
import {
  EMPTY_FILTERS, filterCount, filterGraph, legendOf, relationsOf, type GraphFilters,
} from '../../viewmodels/graph.ts';
import { layoutGraph3D, resolveSelection3D } from '../../viewmodels/graph3d.ts';
import { buildGraphMode, GRAPH_MODES, type GraphMode } from '../../viewmodels/graph-modes.ts';
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

export function AtlasView(
  { state, world, access, filters, setFilters, selectedId, onSelect }:
  {
    state: SystemState;
    world?: WorldState | null;
    access?: 'PUBLIC' | 'PRIVATE';
    filters: GraphFilters;
    setFilters: (next: GraphFilters) => void;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
  },
) {
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode,setMode]=useState<GraphMode>(()=>typeof window==='undefined'?'general':atlasModeFromHash(window.location.hash));

  useEffect(()=>{
    const restore=()=>setMode(atlasModeFromHash(window.location.hash));
    window.addEventListener('hashchange',restore);
    window.addEventListener('popstate',restore);
    return()=>{window.removeEventListener('hashchange',restore);window.removeEventListener('popstate',restore);};
  },[]);

  const graph=useMemo(()=>buildGraphMode(state,mode,access||'PUBLIC',world),[state,mode,access,world]);
  const filtered = useMemo(() => filterGraph(graph, filters), [graph, filters]);
  const placed = useMemo(() => layoutGraph3D(filtered.nodes), [filtered.nodes]);
  const legend = useMemo(() => legendOf(filtered.nodes), [filtered.nodes]);
  const effectiveSelectedId = resolveSelection3D(placed, selectedId);
  const selected: GraphNode | null = filtered.nodes.find(n => n.id === effectiveSelectedId) ?? null;
  const relations = useMemo(
    () => (effectiveSelectedId ? relationsOf(filtered, effectiveSelectedId) : { upstream: [], downstream: [] }),
    [filtered, effectiveSelectedId]);

  const toggle = <K extends FilterKey>(key: K, value: GraphFilters[K][number]) => {
    const current = filters[key] as string[];
    const next = current.includes(value as string)
      ? current.filter(v => v !== value)
      : [...current, value as string];
    setFilters({ ...filters, [key]: next } as GraphFilters);
  };

  const changeMode=(next:GraphMode)=>{
    if(next===mode)return;
    setMode(next);onSelect(null);setFilters({...EMPTY_FILTERS});
    window.history.pushState(null,'',hashForView('ATLAS',next));
  };
  const active = filterCount(filters);
  const modeMeta=GRAPH_MODES.find(item=>item.id===mode)??GRAPH_MODES[0];

  return (
    <div className={`atlas-layout${isMobile ? ' mobile' : ''}`} data-graph-mode={mode}>
      <div className="atlas-toolbar">
        <label className="atlas-mode-control">
          <span className="eyebrow">GRAFO</span>
          <select aria-label="Modo do grafo" value={mode} onChange={event=>changeMode(event.target.value as GraphMode)}>
            {GRAPH_MODES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
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
      <p className="rule-note atlas-mode-note"><strong>{modeMeta.label}.</strong> {modeMeta.description}</p>

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
        <div className="atlas-stage atlas-stage-3d">
          {filtered.nodes.length === 0
            ? <EmptyState title="Nenhuma entidade sobrevive a este filtro."
                description="Um grafo vazio aqui é resultado da projeção ou do filtro, não prova de ausência no sistema."
                hint="Remova um critério ou selecione outro modo de grafo." />
            : <>
                <Atlas3DCanvas nodes={placed} edges={filtered.edges} selectedId={effectiveSelectedId} onSelect={onSelect} />
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

export function LearningView(
  { state, onNavigate }:
  { state: SystemState; onNavigate: (view: 'SOURCES' | 'EXECUTION') => void },
) {
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
        ? <div>
            <EmptyState title="Nenhum filamento neste filtro."
              description="Ainda não há memória derivada das execuções e evidências disponíveis nesta projeção."
              hint="Confirme primeiro se as fontes responderam; depois verifique se já existem execuções com readback." />
            <div className="filter-row" role="group" aria-label="Próximos passos para Learning">
              <button className="primary-button" onClick={() => onNavigate('SOURCES')}>Ver fontes</button>
              <button className="text-button" onClick={() => onNavigate('EXECUTION')}>Ver Execution</button>
            </div>
          </div>
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
