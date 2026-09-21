import { useMemo, useRef, useState } from 'react';
import type { GraphEdge, GraphNode, SystemState } from '../contracts/system.ts';
import { useSystem } from '../data/useSystem.ts';
import { GalaxyThree3D } from '../components/GalaxyThree3D.tsx';
import type { CanvasGraph25DHandle } from '../components/CanvasGraph25D.tsx';
import { layoutGraph3D, layoutMacroDomains, resolveSelection3D } from '../viewmodels/graph3d.ts';
import {
  ATLAS_TOP_DOMAINS,
  atlasSubdomainNodeId,
  atlasSubdomainOf,
  atlasTopDomainOf,
  type AtlasTopDomain,
} from '../viewmodels/atlasTaxonomy.ts';

type Level =
  | { kind: 'ROOT' }
  | { kind: 'BRANCHES' }
  | { kind: 'DOMAIN'; domain: AtlasTopDomain }
  | { kind: 'SUBDOMAIN'; domain: AtlasTopDomain; subdomain: string }
  | { kind: 'ENTITY'; domain: AtlasTopDomain; subdomain: string; entityId: string };

const nowIso = () => new Date().toISOString();

function derivedNode(
  id: string,
  type: GraphNode['type'],
  label: string,
  domain: AtlasTopDomain,
  count: number,
  summary: string,
  sourceRevision: string,
): GraphNode {
  const now = nowIso();
  return {
    id, type, label, domain,
    state: 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'atlas3d://projection',
    source_revision: sourceRevision,
    fingerprint: `atlas3d:${id}:${count}`,
    freshness: { state: 'RECENT', observed_at: now, ttl_seconds: 10800 },
    checked_at: now,
    summary,
    member_count: count,
  };
}

function buildContent(state: SystemState) {
  return state.graph.nodes
    .filter(node => node.type !== 'DOMAIN' && node.type !== 'FILAMENT')
    .map(node => ({ ...node, domain: atlasTopDomainOf(node) as GraphNode['domain'] }));
}

function branchLabel(domain: AtlasTopDomain): string {
  return domain === 'NEXO' ? 'Nexo Core' : domain === 'SCIENCE' ? 'Science' : 'Olympus';
}

function branchNode(domain: AtlasTopDomain, content: GraphNode[], revision: string): GraphNode {
  const members = content.filter(node => node.domain === domain);
  return derivedNode(
    `atlas3d.branch.${domain.toLowerCase()}`,
    'DOMAIN',
    branchLabel(domain),
    domain,
    members.length,
    `${members.length} entidades neste ramo do Atlas Nexo.`,
    revision,
  );
}

function subdomainNode(
  domain: AtlasTopDomain,
  subdomain: string,
  members: GraphNode[],
  revision: string,
): GraphNode {
  return derivedNode(
    atlasSubdomainNodeId(domain, subdomain),
    'CAMPAIGN',
    subdomain,
    domain,
    members.length,
    `${members.length} entidades relacionadas neste subdomínio.`,
    revision,
  );
}

function hierarchy(state: SystemState, level: Level): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const content = buildContent(state);
  const revision = state.bus.fingerprint;

  const root = derivedNode(
    'atlas3d.root.nexo',
    'DOMAIN',
    'Nexo',
    'NEXO',
    content.length,
    `Raiz do Atlas com ${content.length} entidades navegáveis.`,
    revision,
  );

  if (level.kind === 'ROOT') return { nodes: [root], edges: [] };

  const branches = ATLAS_TOP_DOMAINS.map(domain => branchNode(domain, content, revision));
  if (level.kind === 'BRANCHES') {
    return {
      nodes: [root, ...branches],
      edges: branches.map(node => ({
        id: `atlas3d.edge.root.${node.id}`,
        from: root.id,
        to: node.id,
        kind: 'OWNS',
        weight: 1,
        explanation: `${node.label} é um ramo do Atlas Nexo.`,
      })),
    };
  }

  const branch = branches.find(node => node.domain === level.domain)!;
  const domainMembers = content.filter(node => node.domain === level.domain);
  const groups = new Map<string, GraphNode[]>();
  for (const node of domainMembers) {
    const key = atlasSubdomainOf(node);
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }

  const subdomains = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, members]) => subdomainNode(level.domain, name, members, revision));

  if (level.kind === 'DOMAIN') {
    return {
      nodes: [branch, ...subdomains],
      edges: subdomains.map(node => ({
        id: `atlas3d.edge.domain.${node.id}`,
        from: branch.id,
        to: node.id,
        kind: 'OWNS',
        weight: .92,
        explanation: `${node.label} pertence a ${branch.label}.`,
      })),
    };
  }

  const members = (groups.get(level.subdomain) ?? [])
    .sort((a, b) => a.label.localeCompare(b.label));
  const sub = subdomainNode(level.domain, level.subdomain, members, revision);

  const canonicalEdges = state.graph.edges.filter(edge =>
    members.some(node => node.id === edge.from) &&
    members.some(node => node.id === edge.to),
  );

  if (level.kind === 'SUBDOMAIN') {
    return {
      nodes: [sub, ...members],
      edges: [
        ...members.map(node => ({
          id: `atlas3d.edge.subdomain.${sub.id}.${node.id}`,
          from: sub.id,
          to: node.id,
          kind: 'OWNS' as const,
          weight: .84,
          explanation: `${node.label} pertence a ${sub.label}.`,
        })),
        ...canonicalEdges,
      ],
    };
  }

  const selected = members.find(node => node.id === level.entityId);
  if (!selected) return { nodes: [sub, ...members], edges: canonicalEdges };

  const neighborIds = new Set<string>();
  for (const edge of state.graph.edges) {
    if (edge.from === selected.id) neighborIds.add(edge.to);
    if (edge.to === selected.id) neighborIds.add(edge.from);
  }
  const neighbors = content.filter(node => neighborIds.has(node.id));
  const localNodes = [selected, ...neighbors];
  const localIds = new Set(localNodes.map(node => node.id));
  return {
    nodes: localNodes,
    edges: state.graph.edges.filter(edge => localIds.has(edge.from) && localIds.has(edge.to)),
  };
}

export default function Atlas3DApp() {
  const system = useSystem();
  const [level, setLevel] = useState<Level>({ kind: 'ROOT' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threeFailed, setThreeFailed] = useState(false);
  const graphRef = useRef<CanvasGraph25DHandle | null>(null);

  const graph = useMemo(
    () => system.state ? hierarchy(system.state, level) : { nodes: [], edges: [] },
    [level, system.state],
  );

  const placed = useMemo(() => {
    if (level.kind === 'ROOT' || level.kind === 'BRANCHES') return layoutMacroDomains(graph.nodes, window.innerWidth < 760);
    return layoutGraph3D(graph.nodes);
  }, [graph.nodes, level.kind]);

  const effectiveSelected = resolveSelection3D(placed, selectedId);

  const goBack = () => {
    setSelectedId(null);
    if (level.kind === 'ROOT') return;
    if (level.kind === 'BRANCHES') setLevel({ kind: 'ROOT' });
    else if (level.kind === 'DOMAIN') setLevel({ kind: 'BRANCHES' });
    else if (level.kind === 'SUBDOMAIN') setLevel({ kind: 'DOMAIN', domain: level.domain });
    else setLevel({ kind: 'SUBDOMAIN', domain: level.domain, subdomain: level.subdomain });
    requestAnimationFrame(() => graphRef.current?.reset());
  };

  const onSelect = (id: string | null) => {
    if (!id) { setSelectedId(null); return; }
    const node = graph.nodes.find(candidate => candidate.id === id);
    if (!node) return;

    if (id === 'atlas3d.root.nexo') {
      setLevel({ kind: 'BRANCHES' });
      setSelectedId(null);
      return;
    }

    if (id.startsWith('atlas3d.branch.')) {
      setLevel({ kind: 'DOMAIN', domain: node.domain as AtlasTopDomain });
      setSelectedId(null);
      return;
    }

    if (node.type === 'CAMPAIGN') {
      setLevel({ kind: 'SUBDOMAIN', domain: node.domain as AtlasTopDomain, subdomain: node.label });
      setSelectedId(null);
      return;
    }

    const domain = atlasTopDomainOf(node);
    const subdomain = atlasSubdomainOf(node);
    setLevel({ kind: 'ENTITY', domain, subdomain, entityId: id });
    setSelectedId(id);
    requestAnimationFrame(() => graphRef.current?.focusEntity(id));
  };

  const crumbs = (() => {
    const out = ['Nexo'];
    if (level.kind === 'ROOT') return out;
    if (level.kind === 'BRANCHES') return out;
    out.push(branchLabel(level.domain));
    if (level.kind === 'SUBDOMAIN' || level.kind === 'ENTITY') out.push(level.subdomain);
    if (level.kind === 'ENTITY') out.push(graph.nodes.find(n => n.id === level.entityId)?.label ?? level.entityId);
    return out;
  })();

  if (!system.state) {
    return <main className="atlas3d-boot">
      <strong>NEXO ATLAS 3D</strong>
      <span>{system.error || 'Carregando projeção…'}</span>
      {system.error && <button onClick={system.reload}>Tentar novamente</button>}
    </main>;
  }

  return (
    <main className="atlas3d-page">
      <header className="atlas3d-topbar">
        <div className="atlas3d-brand">
          <a href="/" aria-label="Voltar ao NEXO ONE">N</a>
          <div><strong>NEXO ATLAS</strong><small>3D GRAPH</small></div>
        </div>
        <div className="atlas3d-meta">
          <span>{system.state.graph.nodes.length} entidades</span>
          <button onClick={system.reload} disabled={system.syncing}>↻</button>
        </div>
      </header>

      <nav className="atlas3d-breadcrumb" aria-label="Caminho atual">
        {level.kind !== 'ROOT' && <button onClick={goBack}>←</button>}
        {crumbs.map((crumb, index) => <span key={index}>{crumb}</span>)}
      </nav>

      <section className="atlas3d-stage">
        {threeFailed ? (
          <div className="atlas3d-error">
            <strong>O renderer 3D falhou neste navegador.</strong>
            <span>Nesta página não existe fallback 2D. Recarregue para tentar novamente.</span>
            <button onClick={() => location.reload()}>Recarregar</button>
          </div>
        ) : (
          <GalaxyThree3D
            ref={graphRef}
            nodes={placed}
            edges={graph.edges}
            selectedId={effectiveSelected}
            onSelect={onSelect}
            onFailure={() => setThreeFailed(true)}
            viewMode={level.kind === 'ROOT' || level.kind === 'BRANCHES' ? 'macro' : 'detail'}
            ariaLabel="NEXO Atlas 3D hierárquico"
          />
        )}
      </section>

      <footer className="atlas3d-hint">
        <span>
          {level.kind === 'ROOT' && 'Toque em Nexo para abrir o Atlas'}
          {level.kind === 'BRANCHES' && 'Escolha um ramo'}
          {level.kind === 'DOMAIN' && 'Escolha um subdomínio'}
          {level.kind === 'SUBDOMAIN' && 'Escolha uma entidade'}
          {level.kind === 'ENTITY' && 'Arraste para orbitar · pinça para zoom · toque num vizinho para navegar'}
        </span>
      </footer>
    </main>
  );
}
