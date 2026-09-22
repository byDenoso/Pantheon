import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSystem } from '../data/useSystem.ts';
import {
  atlasPathTo,
  buildAtlasMetroModel,
  relatedAtlasNodes,
  visibleAtlasIds,
  type AtlasMetroNode,
} from './atlasAdapter.ts';
import { MetroAtlasRenderer } from './MetroAtlasRenderer.tsx';

type ViewMode = '2d' | '3d';

const DOMAIN_COLOR: Record<string, string> = {
  NEXO: '#7c3aed',
  SCIENCE: '#00c2ff',
  OLYMPUS: '#f97316',
};

function statusTone(status: string): string {
  const value = status.toUpperCase();
  if (/CONFLICT|FAILED|BLOCKED|REJECTED|MISSING/.test(value)) return 'bad';
  if (/WATCH|AGING|STALE|DEGRADED|UNKNOWN|UNVERIFIED|INCONCLUSIVE/.test(value)) return 'warn';
  return 'good';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function DetailPanel({
  node,
  children,
  related,
  generatedAt,
}: {
  node: AtlasMetroNode | null;
  children: AtlasMetroNode[];
  related: AtlasMetroNode[];
  generatedAt: string;
}) {
  if (!node) {
    return <div className="atlas-empty"><strong>Nenhuma estação selecionada</strong><span>Clique em uma estação do mapa.</span></div>;
  }

  const color = DOMAIN_COLOR[node.domain];

  return (
    <div className="atlas-detail" data-selected-node={node.id}>
      <div className="atlas-domain-pill" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>
        <span style={{ background: color }} />{node.domain}
      </div>
      <h1>{node.name}</h1>
      <p className="atlas-summary">{node.summary}</p>

      <div className="atlas-meta-grid">
        <div><span>Tipo</span><strong>{node.entityType}</strong></div>
        <div><span>Estado</span><strong className={`tone-${statusTone(node.status)}`}>{node.status}</strong></div>
        <div><span>Filhos</span><strong>{node.childCount}</strong></div>
        <div><span>Relações</span><strong>{node.relationCount}</strong></div>
        <div><span>Profundidade</span><strong>{node.depth}</strong></div>
        <div><span>Atualizado</span><strong>{formatDate(node.updatedAt)}</strong></div>
      </div>

      <section className="atlas-detail-section">
        <header><strong>Subestações</strong><span>{children.length}</span></header>
        <div className="atlas-chips">
          {children.length
            ? children.map(child => <span className="atlas-chip" key={child.id}>{child.name}</span>)
            : <span className="atlas-chip">folha</span>}
        </div>
      </section>

      <section className="atlas-detail-section">
        <header><strong>Pontes</strong><span>{related.length}</span></header>
        <div className="atlas-chips">
          {related.length
            ? related.slice(0, 18).map(item => <span className="atlas-chip" key={item.id}>{item.name}</span>)
            : <span className="atlas-chip">sem relação transversal visível</span>}
        </div>
      </section>

      <section className="atlas-detail-section">
        <header><strong>Temporal</strong><span>{node.temporal.length}</span></header>
        <div className="atlas-timeline">
          {node.temporal.length ? node.temporal.map(point => (
            <div key={`${point.label}:${point.at}`}>
              <span>{point.label}</span><strong>{formatDate(point.at)}</strong>
            </div>
          )) : <p>Não há série histórica publicada para esta entidade.</p>}
          <div><span>projeção atual</span><strong>{formatDate(generatedAt)}</strong></div>
        </div>
      </section>

      <section className="atlas-detail-section atlas-provenance">
        <header><strong>Proveniência</strong><span>{node.synthetic ? 'derivada' : 'canônica'}</span></header>
        <dl>
          <dt>ID</dt><dd>{node.id}</dd>
          <dt>source_revision</dt><dd>{node.sourceRevision || '—'}</dd>
          <dt>fingerprint</dt><dd>{node.fingerprint || '—'}</dd>
          <dt>authority</dt><dd>{node.authorityClass || '—'}</dd>
        </dl>
      </section>
    </div>
  );
}

export default function Atlas3DApp() {
  const system = useSystem();
  const model = useMemo(() => system.state ? buildAtlasMetroModel(system.state) : null, [system.state]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [showBeams, setShowBeams] = useState(true);
  const [fitNonce, setFitNonce] = useState(0);
  const [rendererReady, setRendererReady] = useState(false);

  useEffect(() => {
    if (!model) return;
    setExpanded(new Set(model.roots));
    setSelectedId(model.roots[0] || null);
    setRendererReady(false);
    setFitNonce(value => value + 1);
  }, [model?.revision]);

  if (!system.state || !model) {
    return (
      <main className="atlas3d-boot">
        <strong>NEXO ATLAS</strong>
        <span>{system.error || 'Carregando projeção…'}</span>
        {system.error && <button onClick={system.reload}>Tentar novamente</button>}
      </main>
    );
  }

  const visibleIds = visibleAtlasIds(model, expanded);
  const visibleSet = new Set(visibleIds);
  const selected = selectedId ? model.nodeMap.get(selectedId) || null : null;
  const children = selected ? (model.childrenMap.get(selected.id) || []).map(id => model.nodeMap.get(id)!).filter(Boolean) : [];
  const related = selected ? relatedAtlasNodes(model, selected.id) : [];
  const breadcrumbs = selected ? atlasPathTo(model, selected.id) : [];

  const activate = (id: string) => {
    const node = model.nodeMap.get(id);
    if (!node) return;
    setSelectedId(id);
    if (node.childCount > 0) {
      setExpanded(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const reset = () => {
    setExpanded(new Set(model.roots));
    setSelectedId(model.roots[0] || null);
    setFitNonce(value => value + 1);
  };

  const selectBreadcrumb = (id: string) => {
    if (!model.nodeMap.has(id)) return;
    setSelectedId(id);
  };

  return (
    <main
      className="atlas3d-page atlas-metro-page"
      data-atlas-renderer="metro-cluster"
      data-atlas-ready={rendererReady ? 'true' : 'false'}
      data-atlas-root-count={model.roots.length}
      data-atlas-visible-count={visibleIds.length}
      data-atlas-mode={viewMode}
    >
      <section className="atlas-workspace">
        <MetroAtlasRenderer
          model={model}
          expanded={expanded}
          selectedId={selectedId}
          showBeams={showBeams}
          viewMode={viewMode}
          fitNonce={fitNonce}
          onActivate={activate}
          onReady={() => setRendererReady(true)}
        />

        <div className="atlas-topbar">
          <nav className="atlas-breadcrumb glass" aria-label="Caminho atual">
            <button onClick={() => { setSelectedId(model.roots[0] || null); }} className="atlas-crumb">Atlas</button>
            {breadcrumbs.map(node => (
              <span className="atlas-crumb-group" key={node.id}>
                <span>›</span>
                <button className="atlas-crumb" onClick={() => selectBreadcrumb(node.id)}>{node.name}</button>
              </span>
            ))}
          </nav>

          <div className="atlas-controls">
            <button
              className="atlas-button atlas-mode-button"
              data-mode={viewMode}
              onClick={() => setViewMode(mode => mode === '2d' ? '3d' : '2d')}
            >
              {viewMode === '2d' ? '3D Explorar' : '2D Metro'}
            </button>
            <label className="atlas-toggle">
              <input type="checkbox" checked={showBeams} onChange={event => setShowBeams(event.target.checked)} />
              Feixes
            </label>
            <button className="atlas-button" onClick={() => setFitNonce(value => value + 1)}>Fit</button>
            <button className="atlas-button" onClick={reset}>Reset</button>
          </div>
        </div>

        <div className="atlas-domain-strip glass" aria-label="Domínios visíveis">
          {model.roots.map(rootId => {
            const root = model.nodeMap.get(rootId)!;
            return (
              <button
                key={rootId}
                className={selectedId === rootId ? 'selected' : ''}
                style={{ '--domain-color': DOMAIN_COLOR[root.domain] } as CSSProperties}
                onClick={() => setSelectedId(rootId)}
              >
                <span />{root.name}<small>{root.descendantCount}</small>
              </button>
            );
          })}
        </div>

        <div className="atlas-legend glass">
          <span><i style={{ background: DOMAIN_COLOR.NEXO }} />Nexo</span>
          <span><i style={{ background: DOMAIN_COLOR.SCIENCE }} />Science</span>
          <span><i style={{ background: DOMAIN_COLOR.OLYMPUS }} />Olympus</span>
          <small>{visibleIds.length} estações visíveis · {model.nodes.length} total</small>
        </div>

        <div className="atlas-interaction-hint">
          {viewMode === '2d'
            ? <>click: seleciona + expande/colapsa<br />drag: pan · wheel: zoom</>
            : <>click: seleciona + expande/colapsa<br />drag: orbita · wheel: zoom · shift+drag / botão direito: pan</>}
        </div>

        <div className="atlas-a11y-stations" aria-label="Estações atualmente renderizadas">
          {visibleIds.map(id => {
            const node = model.nodeMap.get(id)!;
            return (
              <button
                key={id}
                data-domain={node.domain}
                data-depth={node.depth}
                data-visible={visibleSet.has(id) ? 'true' : 'false'}
                onClick={() => activate(id)}
              >
                {node.name}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="atlas-sidebar">
        <div className="atlas-brand">
          <div><strong>NEXO ATLAS</strong><small>METRO + 3D</small></div>
          <span>{system.state.graph.nodes.length} entidades fonte</span>
        </div>
        <DetailPanel
          node={selected}
          children={children}
          related={related}
          generatedAt={model.generatedAt}
        />
        <div className="atlas-source-state">
          <span>{system.sourceLabel}</span>
          <button onClick={system.reload} disabled={system.syncing}>{system.syncing ? 'Atualizando…' : '↻ Atualizar'}</button>
        </div>
      </aside>
    </main>
  );
}
