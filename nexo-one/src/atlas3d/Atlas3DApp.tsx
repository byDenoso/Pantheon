import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSystem } from '../data/useSystem.ts';
import {
  atlasPathTo,
  buildAtlasMetroModel,
  relatedAtlasNodes,
  visibleAtlasIds,
  type AtlasCrossLink,
  type AtlasMetroNode,
} from './atlasAdapter.ts';
import { MetroAtlasRenderer } from './MetroAtlasRenderer.tsx';

type ViewMode = '2d' | '3d';
type AtlasTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'nexo.atlas.theme.v1';

function initialAtlasTheme(): AtlasTheme {
  if (typeof window === 'undefined') return 'dark';
  const query = new URLSearchParams(window.location.search).get('theme');
  if (query === 'light' || query === 'dark') return query;
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

const DOMAIN_COLOR_DARK: Record<string, string> = {
  NEXO: '#7c3aed',
  SCIENCE: '#00c2ff',
  OLYMPUS: '#f97316',
};

const DOMAIN_COLOR_LIGHT: Record<string, string> = {
  NEXO: '#6d28d9',
  SCIENCE: '#0369a1',
  OLYMPUS: '#c2410c',
};

function atlasDomainColor(domain: string, theme: AtlasTheme): string {
  return (theme === 'light' ? DOMAIN_COLOR_LIGHT : DOMAIN_COLOR_DARK)[domain] || '#64748b';
}

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

type LearningConnection = {
  id: string;
  kind: AtlasCrossLink['learningKind'];
  theme: string;
  label: string;
  otherId: string;
  otherName: string;
  direction: 'entrada' | 'saída';
  records: number;
};

function DetailPanel({
  node,
  children,
  related,
  learning,
  generatedAt,
  onSelectNode,
  theme,
}: {
  node: AtlasMetroNode | null;
  children: AtlasMetroNode[];
  related: AtlasMetroNode[];
  learning: LearningConnection[];
  generatedAt: string;
  onSelectNode: (id: string) => void;
  theme: AtlasTheme;
}) {
  if (!node) {
    return <div className="atlas-empty"><strong>Nenhuma estação selecionada</strong><span>Clique em uma estação do mapa.</span></div>;
  }

  const color = atlasDomainColor(node.domain, theme);

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
            ? children.map(child => (
              <button className="atlas-chip" key={child.id} onClick={() => onSelectNode(child.id)}>{child.name}</button>
            ))
            : <span className="atlas-chip">folha</span>}
        </div>
      </section>

      <section className="atlas-detail-section">
        <header><strong>Pontes</strong><span>{related.length}</span></header>
        <div className="atlas-chips">
          {related.length
            ? related.slice(0, 18).map(item => (
              <button className="atlas-chip" key={item.id} onClick={() => onSelectNode(item.id)}>{item.name}</button>
            ))
            : <span className="atlas-chip">sem relação transversal visível</span>}
        </div>
      </section>

      <section className="atlas-detail-section atlas-learning-detail">
        <header><strong>Learning</strong><span>{learning.length} rotas</span></header>
        <div className="atlas-learning-list">
          {learning.length ? learning.slice(0, 12).map(item => (
            <button key={item.id} className="atlas-learning-route" onClick={() => onSelectNode(item.otherId)}>
              <span data-kind={item.kind || 'LEARNING'}>{item.kind === 'SCIENTIFIC_LEARNING_PIPELINE' ? 'Scientific' : item.kind === 'PROCEDURAL' ? 'Procedural' : 'Semantic'}</span>
              <strong>{item.theme}</strong>
              <small>{item.direction} · {item.otherName}{item.records > 1 ? ` · ${item.records} registros` : ''}</small>
            </button>
          )) : <span className="atlas-chip">sem Learning direto nesta estação</span>}
          {learning.length > 12 && <small className="atlas-learning-more">+{learning.length - 12} rotas adicionais</small>}
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
  const [atlasTheme, setAtlasTheme] = useState<AtlasTheme>(initialAtlasTheme);
  const [navigationRevision, setNavigationRevision] = useState('');
  const qaExpand = useMemo(
    () => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('expand') : null,
    [],
  );
  const qaExpandedNode = useMemo(() => {
    if (!model) return null;
    if (qaExpand === 'learning-leaf') {
      for (const link of model.crossLinks) {
        if (!link.isLearning) continue;
        const endpoints = [[link.source, link.sourceAnchor], [link.target, link.targetAnchor]] as const;
        for (const [endpoint, anchor] of endpoints) {
          if (anchor !== 'EXACT_ENTITY') continue;
          const leaf = model.nodeMap.get(endpoint);
          const parent = leaf?.parentId ? model.nodeMap.get(leaf.parentId) : null;
          if (parent?.entityType === 'subdomain' && parent.childCount > 0) return parent;
        }
      }
      return null;
    }
    if (qaExpand !== 'dense-science') return null;
    const scienceRoot = model.roots.find(id => model.nodeMap.get(id)?.domain === 'SCIENCE');
    if (!scienceRoot) return null;
    return (model.childrenMap.get(scienceRoot) || [])
      .map(id => model.nodeMap.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .sort((left, right) =>
        right.childCount - left.childCount
        || right.descendantCount - left.descendantCount
        || left.name.localeCompare(right.name)
      )[0] || null;
  }, [model?.revision, qaExpand]);

  const initialExpanded = useMemo(() => {
    if (qaExpand === 'all' && model) {
      return new Set(model.nodes.filter(node => node.childCount > 0).map(node => node.id));
    }
    const initial = new Set(model?.roots || []);
    if (qaExpandedNode?.childCount) initial.add(qaExpandedNode.id);
    return initial;
  }, [model?.revision, qaExpandedNode?.id, qaExpand]);

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === '3d' ? '3d' : '2d'
  );
  const [showBeams, setShowBeams] = useState(true);
  const [show3dHint, setShow3dHint] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [rendererReady, setRendererReady] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.atlasTheme = atlasTheme;
    document.documentElement.style.colorScheme = atlasTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, atlasTheme);
    } catch {
      // Theme persistence is a convenience; rendering must not depend on storage.
    }
    return () => {
      delete document.documentElement.dataset.atlasTheme;
      document.documentElement.style.colorScheme = '';
    };
  }, [atlasTheme]);

  useEffect(() => {
    if (!model) return;
    setExpanded(new Set(initialExpanded));
    setSelectedId(qaExpandedNode?.id || model.roots[0] || null);
    setNavigationRevision(model.revision);
    setRendererReady(false);
    setMobileDetailsOpen(false);
  }, [model?.revision, initialExpanded, qaExpandedNode?.id]);

  if (!system.state || !model) {
    return (
      <main className="atlas3d-boot">
        <strong>NEXO ATLAS</strong>
        <span>{system.error || 'Carregando projeção…'}</span>
        {system.error && <button onClick={system.reload}>Tentar novamente</button>}
      </main>
    );
  }

  // The first render after SystemState arrives must already contain the three
  // expanded domain hubs. Waiting for useEffect here produces one stale G6 frame
  // with only the roots and can lose the expansion update while render() is in flight.
  const navigationStale = navigationRevision !== model.revision;
  const activeExpanded = navigationStale ? new Set(initialExpanded) : expanded;
  const activeSelectedId = navigationStale ? (qaExpandedNode?.id || model.roots[0] || null) : selectedId;

  const visibleIds = visibleAtlasIds(model, activeExpanded);
  const visibleSet = new Set(visibleIds);
  const expandableIds = model.nodes.filter(node => node.childCount > 0).map(node => node.id);
  const allExpanded = expandableIds.length > 0 && expandableIds.every(id => activeExpanded.has(id));
  const selected = activeSelectedId ? model.nodeMap.get(activeSelectedId) || null : null;
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

  const collapseToInitial = () => {
    setExpanded(new Set(model.roots));
    setSelectedId(model.roots[0] || null);
    setFitNonce(value => value + 1);
  };

  const toggleExpandAll = () => {
    if (allExpanded) {
      collapseToInitial();
      return;
    }
    setExpanded(new Set(expandableIds));
    setFitNonce(value => value + 1);
  };

  const toggleTheme = () => {
    setAtlasTheme(current => current === 'dark' ? 'light' : 'dark');
  };

  const reset = collapseToInitial;

  const selectBreadcrumb = (id: string) => {
    if (!model.nodeMap.has(id)) return;
    setSelectedId(id);
  };

  const learningLinks = model.crossLinks.filter(link => link.isLearning);
  const learningLinkCount = learningLinks.length;
  const learningRecordCount = new Set(
    learningLinks.map(link => link.learningRef || link.id),
  ).size;
  const learningExactEntityLinks = learningLinks.filter(link =>
    link.sourceAnchor === 'EXACT_ENTITY' || link.targetAnchor === 'EXACT_ENTITY'
  );
  const learningExactEntityLinkCount = learningExactEntityLinks.length;
  const learningExactEntityEndpointCount = learningExactEntityLinks.reduce((count, link) =>
    count + (link.sourceAnchor === 'EXACT_ENTITY' ? 1 : 0) + (link.targetAnchor === 'EXACT_ENTITY' ? 1 : 0), 0);
  const learningExactEntityRecordCount = new Set(
    learningExactEntityLinks.map(link => link.learningRef || link.id),
  ).size;
  const learningDistinctExactEntities = new Set(
    learningExactEntityLinks.flatMap(link => [
      ...(link.sourceAnchor === 'EXACT_ENTITY' ? [link.source] : []),
      ...(link.targetAnchor === 'EXACT_ENTITY' ? [link.target] : []),
    ]),
  ).size;
  const learningThemeCount = new Set(
    learningLinks.map(link => link.learningTheme || link.learningRef || link.id),
  ).size;
  const scientificLearningLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
  ).length;
  const proceduralLearningLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'PROCEDURAL'
  ).length;
  const semanticLearningLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'SEMANTIC'
  ).length;
  const peerLearningLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
    && /^PEER-DETECTION-GROUP-/i.test(String(link.learningRef || ''))
  ).length;
  const semanticAreaForEndpoint = (endpoint: string): string | null => {
    const node = model.nodeMap.get(endpoint);
    if (!node) return null;
    if (node.entityType === 'subdomain') return node.id;
    if (!node.parentId) return null;
    return model.nodeMap.get(node.parentId)?.entityType === 'subdomain' ? node.parentId : null;
  };
  const learningSubdomainLoads = new Map<string, number>();
  for (const link of learningLinks) {
    for (const endpoint of [link.source, link.target]) {
      const semanticArea = semanticAreaForEndpoint(endpoint);
      if (!semanticArea) continue;
      learningSubdomainLoads.set(semanticArea, (learningSubdomainLoads.get(semanticArea) || 0) + 1);
    }
  }
  const learningSubdomainEndpointCount = [...learningSubdomainLoads.values()]
    .reduce((total, count) => total + count, 0);
  const learningDistinctSubdomainCount = learningSubdomainLoads.size;
  const learningMaxSubdomainLoad = Math.max(0, ...learningSubdomainLoads.values());
  const learningMaxSubdomainShare = learningSubdomainEndpointCount
    ? Math.round((learningMaxSubdomainLoad / learningSubdomainEndpointCount) * 100)
    : 0;
  const peerTargetSubdomains = new Set(model.crossLinks
    .filter(link => link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE')
    .map(link => semanticAreaForEndpoint(link.target))
    .filter((id): id is string => Boolean(id)));
  const learningHubEndpointCount = model.crossLinks
    .filter(link => link.isLearning)
    .reduce((count, link) => count
      + (model.nodeMap.get(link.source)?.entityType === 'hub' ? 1 : 0)
      + (model.nodeMap.get(link.target)?.entityType === 'hub' ? 1 : 0), 0);
  const peerSubdomainLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
    && /^PEER-DETECTION-GROUP-/i.test(String(link.learningRef || ''))
    && model.nodeMap.get(link.target)?.entityType === 'subdomain'
  ).length;
  const semanticSubdomainLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'SEMANTIC'
    && (
      model.nodeMap.get(link.source)?.entityType === 'subdomain'
      || model.nodeMap.get(link.target)?.entityType === 'subdomain'
    )
  ).length;
  const proceduralSubdomainLinkCount = model.crossLinks.filter(link =>
    link.learningKind === 'PROCEDURAL'
    && (
      model.nodeMap.get(link.source)?.entityType === 'subdomain'
      || model.nodeMap.get(link.target)?.entityType === 'subdomain'
    )
  ).length;
  const learningConnections: LearningConnection[] = [];
  if (selected) {
    const grouped = new Map<string, LearningConnection>();
    for (const link of learningLinks) {
      if (link.source !== selected.id && link.target !== selected.id) continue;
      const outgoing = link.source === selected.id;
      const otherId = outgoing ? link.target : link.source;
      const other = model.nodeMap.get(otherId);
      if (!other) continue;
      const theme = link.learningTheme || link.learningGroup || link.label.replace(/^Learning ·\s*/i, '');
      const key = [outgoing ? 'out' : 'in', otherId, link.learningKind || 'LEARNING', theme].join('|');
      const current = grouped.get(key);
      if (current) {
        current.records += 1;
        continue;
      }
      grouped.set(key, {
        id: key,
        kind: link.learningKind,
        theme,
        label: link.label,
        otherId,
        otherName: other.name,
        direction: outgoing ? 'saída' : 'entrada',
        records: 1,
      });
    }
    learningConnections.push(...[...grouped.values()].sort((left, right) =>
      left.otherName.localeCompare(right.otherName) || left.theme.localeCompare(right.theme)
    ));
  }

  const peerArtifactNodeCount = model.nodes.filter(node => {
    const source = String(node.sourceId || '');
    return /^work:PEER-DETECTION-D\d+/i.test(source)
      || /^test:PEER-DETECTION-D\d+/i.test(source)
      || /^capability:peer\.detection\./i.test(source);
  }).length;

  const switchViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode !== '3d') {
      setShow3dHint(false);
      return;
    }
    try {
      const key = 'nexo.atlas.3d-affordance-seen.v1';
      if (window.localStorage.getItem(key) !== '1') {
        setShow3dHint(true);
        window.localStorage.setItem(key, '1');
      }
    } catch {
      setShow3dHint(true);
    }
  };

  return (
    <main
      className="atlas3d-page atlas-metro-page"
      data-atlas-renderer="metro-cluster"
      data-atlas-ready={rendererReady ? 'true' : 'false'}
      data-atlas-root-count={model.roots.length}
      data-atlas-visible-count={visibleIds.length}
      data-atlas-mode={viewMode}
      data-atlas-theme={atlasTheme}
      data-atlas-expansion={allExpanded ? 'all' : 'context'}
      data-atlas-expanded-count={activeExpanded.size}
      data-atlas-qa-expand={qaExpand || 'none'}
      data-atlas-qa-expanded-node={qaExpandedNode?.name || 'none'}
      data-atlas-learning-links={learningLinkCount}
      data-atlas-learning-records={learningRecordCount}
      data-atlas-learning-exact-entity-links={learningExactEntityLinkCount}
      data-atlas-learning-exact-entity-endpoints={learningExactEntityEndpointCount}
      data-atlas-learning-exact-entity-records={learningExactEntityRecordCount}
      data-atlas-learning-distinct-exact-entities={learningDistinctExactEntities}
      data-atlas-learning-themes={learningThemeCount}
      data-atlas-learning-scientific={scientificLearningLinkCount}
      data-atlas-learning-procedural={proceduralLearningLinkCount}
      data-atlas-learning-semantic={semanticLearningLinkCount}
      data-atlas-peer-learning-links={peerLearningLinkCount}
      data-atlas-learning-subdomain-endpoints={learningSubdomainEndpointCount}
      data-atlas-learning-distinct-subdomains={learningDistinctSubdomainCount}
      data-atlas-learning-max-subdomain-load={learningMaxSubdomainLoad}
      data-atlas-learning-max-subdomain-share={learningMaxSubdomainShare}
      data-atlas-peer-target-subdomains={peerTargetSubdomains.size}
      data-atlas-learning-hub-endpoints={learningHubEndpointCount}
      data-atlas-peer-subdomain-links={peerSubdomainLinkCount}
      data-atlas-semantic-subdomain-links={semanticSubdomainLinkCount}
      data-atlas-procedural-subdomain-links={proceduralSubdomainLinkCount}
      data-atlas-peer-artifact-nodes={peerArtifactNodeCount}
    >
      <section className="atlas-workspace">
        <MetroAtlasRenderer
          model={model}
          expanded={activeExpanded}
          selectedId={activeSelectedId}
          showBeams={showBeams}
          viewMode={viewMode}
          theme={atlasTheme}
          fitNonce={fitNonce}
          onActivate={activate}
          onReady={() => setRendererReady(true)}
        />

        <div className="atlas-topbar">
          <a className="atlas-product-brand glass" href="../" aria-label="Voltar ao NEXO ONE">
            <span className="atlas-product-mark">N</span>
            <span className="atlas-product-copy"><strong>NEXO ONE</strong><small>ATLAS</small></span>
          </a>
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
            <div className="atlas-view-switch" role="group" aria-label="Modo de visualização" data-active-mode={viewMode}>
              <button
                className={viewMode === '2d' ? 'active' : ''}
                aria-pressed={viewMode === '2d'}
                onClick={() => switchViewMode('2d')}
              >
                <span className="atlas-view-icon">▦</span>
                <span><strong>2D</strong><small>Metro</small></span>
                {viewMode === '2d' && <em>ATIVO</em>}
              </button>
              <button
                className={viewMode === '3d' ? 'active' : ''}
                aria-pressed={viewMode === '3d'}
                onClick={() => switchViewMode('3d')}
              >
                <span className="atlas-view-icon">◇</span>
                <span><strong>3D</strong><small>Explorar</small></span>
                {viewMode === '3d' && <em>ATIVO</em>}
              </button>
            </div>
            <button
              className="atlas-button atlas-theme-button"
              aria-pressed={atlasTheme === 'light'}
              aria-label={atlasTheme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              onClick={toggleTheme}
            >
              <span aria-hidden="true">{atlasTheme === 'dark' ? '☼' : '☾'}</span>
              {atlasTheme === 'dark' ? 'Claro' : 'Escuro'}
            </button>
            <button
              className="atlas-button atlas-expand-button"
              aria-pressed={allExpanded}
              onClick={toggleExpandAll}
            >
              <span aria-hidden="true">{allExpanded ? '⊟' : '⊞'}</span>
              {allExpanded ? 'Contrair tudo' : 'Expandir tudo'}
            </button>
            <label className="atlas-toggle">
              <input type="checkbox" checked={showBeams} onChange={event => setShowBeams(event.target.checked)} />
              Feixes
            </label>
            <button className="atlas-button" onClick={() => setFitNonce(value => value + 1)}>Fit</button>
            <button className="atlas-button" onClick={reset}>Reset</button>
            <button
              className="atlas-button atlas-mobile-details-toggle"
              aria-expanded={mobileDetailsOpen}
              aria-controls="atlas-details-panel"
              onClick={() => setMobileDetailsOpen(value => !value)}
            >
              Detalhes
            </button>
          </div>
        </div>

        <div className="atlas-domain-strip glass" aria-label="Domínios visíveis">
          {model.roots.map(rootId => {
            const root = model.nodeMap.get(rootId)!;
            return (
              <button
                key={rootId}
                className={activeSelectedId === rootId ? 'selected' : ''}
                style={{ '--domain-color': atlasDomainColor(root.domain, atlasTheme) } as CSSProperties}
                onClick={() => setSelectedId(rootId)}
              >
                <span />{root.name}<small>{root.descendantCount}</small>
              </button>
            );
          })}
        </div>

        <div className="atlas-legend glass">
          <span><i style={{ background: atlasDomainColor('NEXO', atlasTheme) }} />Nexo</span>
          <span><i style={{ background: atlasDomainColor('SCIENCE', atlasTheme) }} />Science</span>
          <span><i style={{ background: atlasDomainColor('OLYMPUS', atlasTheme) }} />Olympus</span>
          {learningLinkCount > 0 && (
            <span
              className="atlas-learning-legend"
              title={`${learningRecordCount} aprendizados canônicos · ${learningThemeCount} temas · ${learningLinkCount} relações · Scientific ${scientificLearningLinkCount} · Procedural ${proceduralLearningLinkCount} · Semantic ${semanticLearningLinkCount} · ${learningDistinctSubdomainCount} áreas · maior concentração ${learningMaxSubdomainShare}%`}
            >
              <i />Learning <b>{learningRecordCount}</b><em>{learningThemeCount} temas</em>
            </span>
          )}
          <small>{visibleIds.length} estações visíveis · {model.nodes.length} total</small>
        </div>

        {viewMode === '3d' && show3dHint && (
          <div className="atlas-mode-onboarding glass" role="status">
            <div><strong>Modo 3D ativo</strong><span>Arraste o fundo para orbitar a câmera. A orientação espacial agora é livre.</span></div>
            <button onClick={() => setShow3dHint(false)} aria-label="Fechar dica">×</button>
          </div>
        )}

        <div className="atlas-interaction-hint" data-active-mode={viewMode}>
          <strong>{viewMode === '2d' ? '2D METRO ATIVO' : '3D EXPLORAR ATIVO'}</strong><br />
          {viewMode === '2d'
            ? <>click: seleciona + expande/colapsa · drag: pan · wheel: zoom</>
            : <>drag: orbita · wheel: zoom · shift+drag / botão direito: pan</>}
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

      {mobileDetailsOpen && (
        <button
          className="atlas-sidebar-backdrop"
          aria-label="Fechar painel de detalhes"
          onClick={() => setMobileDetailsOpen(false)}
        />
      )}
      <aside
        id="atlas-details-panel"
        className={`atlas-sidebar${mobileDetailsOpen ? ' mobile-open' : ''}`}
        aria-hidden={!mobileDetailsOpen ? undefined : false}
      >
        <div className="atlas-brand">
          <div><strong>NEXO ATLAS</strong><small>METRO + 3D</small></div>
          <span>{system.state.graph.nodes.length} entidades fonte</span>
          <button
            className="atlas-mobile-sidebar-close"
            aria-label="Fechar painel de detalhes"
            onClick={() => setMobileDetailsOpen(false)}
          >
            ×
          </button>
        </div>
        <DetailPanel
          node={selected}
          children={children}
          related={related}
          learning={learningConnections}
          generatedAt={model.generatedAt}
          onSelectNode={setSelectedId}
          theme={atlasTheme}
        />
        <div className="atlas-source-state">
          <span>{system.sourceLabel}</span>
          <button onClick={system.sync} disabled={system.syncing}>{system.syncing ? 'Sincronizando…' : '↻ Sincronizar'}</button>
        </div>
      </aside>
    </main>
  );
}
