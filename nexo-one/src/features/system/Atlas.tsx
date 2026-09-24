// Atlas: mapa estrutural do sistema. Cada nó é uma entidade projetada com estado,
// autoridade e proveniência próprios; Canvas 2.5D é somente projeção.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode, SystemState } from '../../contracts/system.ts';
import {
  AuthorityClass, CAPABILITY_STATUSES, DOMAINS, GRAPH_NODE_TYPES, PROJECTION_STATES, RELATION_KINDS,
} from '../../contracts/system.ts';
import { AtlasGalaxyRenderer } from '../../components/AtlasGalaxyRenderer.tsx';
import type { CanvasGraph25DHandle } from '../../components/CanvasGraph25D.tsx';
import { EntityInspector } from '../../components/inspector.tsx';
import { EmptyState } from '../../components/states.tsx';
import { DomainBadge, SeverityBadge, StatusBadge } from '../../components/primitives.tsx';
import { useIsMobile } from '../../app/useMediaQuery.ts';
import {
  EMPTY_FILTERS, filterCount, filterGraph, legendOf, relationsOf, type GraphFilters,
} from '../../viewmodels/graph.ts';
import { layoutFromGalaxy, layoutMacroDomains, resolveSelection3D } from '../../viewmodels/graph3d.ts';
import { ATLAS_TOP_DOMAINS, atlasSubdomainFromId, atlasSubdomainNodeId, atlasSubdomainOf, atlasTopDomainOf, type AtlasTopDomain } from '../../viewmodels/atlasTaxonomy.ts';
import { useGalaxySnapshot } from '../../data/useGalaxySnapshot.ts';
import { galaxySnapshotAgeLabel } from '../../data/galaxySnapshot.ts';
import { label, toneOf } from '../../viewmodels/tokens.ts';
import { LAYER_TYPES, PRESETS, applyPreset, type LayerId } from '../../viewmodels/layers.ts';
import { TOUR_ROUTES, resolveTourAction, tourRouteById, type TourRouteId } from '../../viewmodels/tour.ts';
import {
  buildGalaxySearch, parseGalaxyDeepLink, type GalaxyMode, type GalaxyPanelId,
} from '../../app/galaxyDeepLink.ts';
import { useGalaxyAudio } from '../../app/useGalaxyAudio.ts';
import { registerGalaxyWebMcpTools } from '../../mcp/webmcpTools.ts';
import { GalaxyIntro } from './GalaxyIntro.tsx';
import { OperateHUD } from './OperateHUD.tsx';
import './AtlasWorlds.css';

const AUTHORITIES: AuthorityClass[] = ['TRUTH_OWNER', 'DELEGATED', 'DERIVED', 'NON_AUTHORITATIVE'];
const FRESHNESS_VALUES = ['LIVE', 'RECENT', 'AGING', 'STALE', 'UNKNOWN'] as const;

const DOMAIN_WORLD_GLYPH: Partial<Record<GraphNode['domain'], string>> = {
  NEXO: 'N', SCIENCE: 'S', ENGINEERING: 'E', OLYMPUS: 'O', ARTIFACT: 'A',
};

const DOMAIN_WORLD_CAPTION: Partial<Record<GraphNode['domain'], string>> = {
  NEXO: 'KNOWLEDGE ATLAS',
  SCIENCE: 'PESQUISA · DADOS · DESCOBERTAS',
  ENGINEERING: 'SISTEMAS · CONSTRUÇÃO · AUTOMAÇÃO',
  OLYMPUS: 'ESTRATÉGIA · PESSOAS · PERFORMANCE',
  ARTIFACT: 'PRODUTOS · IDEIAS · IMPLEMENTAÇÃO',
};

type FilterKey = 'domains' | 'types' | 'states' | 'freshness' | 'authorities' | 'relations';

const ATLAS_CLUSTER_TYPES: GraphNode['type'][] = [
  'PROVIDER', 'CAPABILITY', 'ACTION', 'EFFECT', 'PROJECTION', 'CLAIM', 'MEMORY', 'SIDE_QUEST', 'FILAMENT',
];

const clusterIdFor = (domain: GraphNode['domain'], type: GraphNode['type']): string =>
  `atlas.cluster.${domain.toLowerCase()}.${type.toLowerCase()}`;

const clusterFromId = (id: string): { domain: GraphNode['domain']; type: GraphNode['type'] } | null => {
  const match = /^atlas\.cluster\.([^\.]+)\.([^\.]+)$/.exec(id);
  if (!match) return null;
  const domain = match[1].toUpperCase() as GraphNode['domain'];
  const type = match[2].toUpperCase() as GraphNode['type'];
  return ATLAS_CLUSTER_TYPES.includes(type) ? { domain, type } : null;
};

function clusterNode(domain: GraphNode['domain'], type: GraphNode['type'], count: number): GraphNode {
  const title = label(type).toUpperCase();
  return {
    id: clusterIdFor(domain, type), type: 'PROVIDER', label: `${title} · ${count}`,
    domain, state: 'LIVE', authority_class: 'DERIVED', source_ref: 'atlas://projection/cluster',
    source_revision: 'projection', fingerprint: `atlas-cluster:${domain}:${type}`,
    freshness: { state: 'LIVE', observed_at: new Date().toISOString(), ttl_seconds: null },
    checked_at: new Date().toISOString(), summary: `${count} entidades ${title.toLowerCase()} no domínio ${domain}.`,
  };
}


const NO_CAMPAIGN = '__NO_CAMPAIGN__';

const campaignNodeId = (domain: GraphNode['domain'], campaignId: string): string =>
  'atlas.campaign.' + domain.toLowerCase() + '.' + encodeURIComponent(campaignId);

const campaignFromId = (id: string): { domain: GraphNode['domain']; campaignId: string } | null => {
  const match = /^atlas\.campaign\.([^.]+)\.(.+)$/.exec(id);
  if (!match) return null;
  try {
    return {
      domain: match[1].toUpperCase() as GraphNode['domain'],
      campaignId: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
};

function campaignNode(
  domain: GraphNode['domain'],
  campaignId: string,
  count: number,
  sample: GraphNode | null,
): GraphNode {
  const now = new Date().toISOString();
  const display = campaignId === NO_CAMPAIGN ? 'SEM CAMPANHA' : campaignId;
  return {
    id: campaignNodeId(domain, campaignId),
    type: 'CAMPAIGN',
    label: display,
    domain,
    state: sample?.state ?? 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'atlas://projection/campaign',
    source_revision: sample?.source_revision ?? 'projection',
    fingerprint: 'atlas-campaign:' + domain + ':' + campaignId,
    freshness: sample?.freshness ?? { state: 'LIVE', observed_at: now, ttl_seconds: null },
    checked_at: sample?.checked_at ?? now,
    summary: sample?.semantic_description
      ?? sample?.summary
      ?? ('Campanha científica ' + display + ' com ' + count + ' entidades operacionais agregadas.'),
    semantic_description: sample?.semantic_description ?? sample?.summary,
    semantic_state: sample?.semantic_state ?? (count + ' entidades operacionais agregadas; testes individuais não são projetados no Atlas.'),
    campaign_id: campaignId === NO_CAMPAIGN ? undefined : campaignId,
    member_count: count,
  };
}


function semanticTopNode(
  domain: AtlasTopDomain,
  count: number,
  snapshot: ReturnType<typeof useGalaxySnapshot>['snapshot'],
): GraphNode {
  const labels: Record<AtlasTopDomain, string> = { NEXO: 'Nexo Core', SCIENCE: 'Science', OLYMPUS: 'Olympus' };
  return {
    id: `atlas.top.${domain.toLowerCase()}`,
    type: 'DOMAIN',
    label: labels[domain],
    domain,
    state: 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'atlas://projection/top-domain',
    source_revision: snapshot.tower_revision,
    fingerprint: `atlas-top:${domain}:${snapshot.fingerprint}`,
    freshness: { state: 'RECENT', observed_at: snapshot.generated_at, ttl_seconds: 3 * 60 * 60 },
    checked_at: snapshot.generated_at,
    summary: `${count} entidades agrupadas semanticamente em ${labels[domain]}. A Tower continua autoridade.`,
    member_count: count,
  };
}

function semanticRootNode(
  count: number,
  snapshot: ReturnType<typeof useGalaxySnapshot>['snapshot'],
): GraphNode {
  return {
    id: 'atlas.root.nexo',
    type: 'DOMAIN',
    label: 'Nexo',
    domain: 'NEXO',
    state: 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'atlas://projection/root',
    source_revision: snapshot.tower_revision,
    fingerprint: `atlas-root:nexo:${snapshot.fingerprint}`,
    freshness: { state: 'RECENT', observed_at: snapshot.generated_at, ttl_seconds: 3 * 60 * 60 },
    checked_at: snapshot.generated_at,
    summary: `Raiz visual do Atlas com ${count} entidades navegáveis. A Tower continua autoridade.`,
    member_count: count,
  };
}


function semanticSubdomainNode(
  domain: AtlasTopDomain,
  subdomain: string,
  count: number,
  sample: GraphNode | null,
): GraphNode {
  const now = new Date().toISOString();
  return {
    id: atlasSubdomainNodeId(domain, subdomain),
    type: 'SUBDOMAIN',
    label: subdomain,
    domain,
    state: sample?.state ?? 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'atlas://projection/semantic-subdomain',
    source_revision: sample?.source_revision ?? 'projection',
    fingerprint: `atlas-subdomain:${domain}:${subdomain}`,
    freshness: sample?.freshness ?? { state: 'LIVE', observed_at: now, ttl_seconds: null },
    checked_at: sample?.checked_at ?? now,
    summary: `${count} entidades agrupadas por afinidade semântica real da projeção atual. A Tower continua autoridade.`,
    member_count: count,
  };
}


function visualDomainNode(
  domain: GraphNode['domain'],
  snapshot: ReturnType<typeof useGalaxySnapshot>['snapshot'],
): GraphNode {
  return {
    id: `galaxy.domain.${domain.toLowerCase()}`,
    type: 'DOMAIN',
    label: domain,
    domain,
    state: 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'galaxy://projection/domain',
    source_revision: snapshot.tower_revision,
    fingerprint: snapshot.fingerprint,
    freshness: { state: 'RECENT', observed_at: snapshot.generated_at, ttl_seconds: 3 * 60 * 60 },
    checked_at: snapshot.generated_at,
    summary: `Domínio visual ${domain} derivado do contrato ${snapshot.contract}.`,
  };
}


function DomainWorlds(
  { nodes, onOpen }: { nodes: GraphNode[]; onOpen: (id: string) => void },
) {
  const domains = nodes.filter(node => node.type === 'DOMAIN');
  const total = domains.reduce((sum, node) => sum + (node.member_count ?? 0), 0);
  return (
    <div className="atlas-domain-worlds" aria-label="Domínios do NEXO Atlas">
      <div className="atlas-world-heading" aria-hidden="true">
        <strong>NEXO ATLAS</strong>
        <span>CONHECIMENTO SEM FRONTEIRAS · INTELIGÊNCIA EM CONTEXTO</span>
      </div>
      {domains.map(node => {
        const count = node.member_count ?? 0;
        return (
          <button key={node.id} type="button"
            className={'atlas-domain-world domain-' + node.domain.toLowerCase()}
            onClick={() => onOpen(node.id)}>
            <span className="atlas-world-orb" aria-hidden="true">
              <i className="atlas-world-ring ring-a" />
              <i className="atlas-world-ring ring-b" />
              <i className="atlas-world-satellite sat-a" />
              <i className="atlas-world-satellite sat-b" />
              <i className="atlas-world-satellite sat-c" />
              <b>{DOMAIN_WORLD_GLYPH[node.domain] ?? '·'}</b>
            </span>
            <span className="atlas-world-copy">
              <strong>{node.domain === 'NEXO' ? 'NEXO CORE' : node.label}</strong>
              <small>{node.domain === 'NEXO' ? 'KNOWLEDGE ATLAS' : count + ' ENTIDADES'}</small>
              {node.domain !== 'NEXO' && <em>{DOMAIN_WORLD_CAPTION[node.domain] ?? 'DOMÍNIO NEXO'}</em>}
            </span>
          </button>
        );
      })}
      <div className="atlas-world-summary" aria-hidden="true">
        <span><b>{domains.filter(node => node.domain !== 'NEXO').length}</b> domínios</span>
        <span><b>{total}</b> entidades</span>
        <span className="live"><i /> sincronizado</span>
      </div>
    </div>
  );
}

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
  const galaxyRef = useRef<CanvasGraph25DHandle | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [learningVisible, setLearningVisible] = useState(true);
  const [localFocusId, setLocalFocusId] = useState<string | null>(null);
  // Start at the domain overview. A single isolated NEXO node looked like an
  // empty graph even when the sanctioned projection contained hundreds of entities.
  const [rootExpanded, setRootExpanded] = useState(false);
  // Start at the single Nexo root; drill down spatially into domains and subdomains.
  const [expandAll, setExpandAll] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<GraphNode['domain'] | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [mode, setMode] = useState<GalaxyMode>('explore');
  const [openPanel, setOpenPanel] = useState<GalaxyPanelId | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [activeTourRoute, setActiveTourRoute] = useState<TourRouteId | null>(null);
  const audio = useGalaxyAudio(isMobile);
  const deepLinkAppliedRef = useRef(false);
  const galaxyState = useGalaxySnapshot(state);
  const galaxySnapshot = galaxyState.snapshot;
  const graphForView = useMemo(() => {
    const contentNodes = state.graph.nodes
      .filter(node => node.type !== 'DOMAIN')
      .map(node => ({ ...node, domain: atlasTopDomainOf(node) as GraphNode['domain'] }));
    const contentIds = new Set(contentNodes.map(node => node.id));
    const topNodes = ATLAS_TOP_DOMAINS.map(domain => semanticTopNode(
      domain,
      contentNodes.filter(node => node.type !== 'FILAMENT' && node.domain === domain).length,
      galaxySnapshot,
    ));
    const rootNode = semanticRootNode(
      contentNodes.filter(node => node.type !== 'FILAMENT').length,
      galaxySnapshot,
    );
    return {
      nodes: [rootNode, ...topNodes, ...contentNodes],
      edges: state.graph.edges.filter(edge => contentIds.has(edge.from) && contentIds.has(edge.to)),
    };
  }, [galaxySnapshot, state.graph.edges, state.graph.nodes]);
  const filtered = useMemo(() => filterGraph(graphForView, filters), [filters, graphForView]);
  const learningEdges = useMemo(() => filtered.edges.filter(edge => edge.is_learning), [filtered.edges]);
  const learningInterDomain = useMemo(
    () => learningEdges.filter(edge => edge.learning_scope === 'INTER_DOMAIN').length,
    [learningEdges],
  );
  const learningIntraDomain = useMemo(
    () => learningEdges.filter(edge => edge.learning_scope === 'INTRA_DOMAIN').length,
    [learningEdges],
  );
  const [expandedCluster, setExpandedCluster] = useState<GraphNode['type'] | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const renderGraph = useMemo(() => {
    // Learning is transverse. Top domains and semantic subdomains are presentation-only.
    const sourceNodes = filtered.nodes.filter(node => learningVisible || node.type !== 'FILAMENT');
    const baseNodes = sourceNodes.filter(node => node.type !== 'TEST');
    const domainNodes = baseNodes.filter(node => node.type === 'DOMAIN');
    const rootNode = domainNodes.find(node => node.id === 'atlas.root.nexo');
    const branchDomains = domainNodes.filter(node => node.id !== 'atlas.root.nexo' && ATLAS_TOP_DOMAINS.includes(node.domain as AtlasTopDomain));
    const contentNodes = baseNodes.filter(node => node.type !== 'DOMAIN' && node.type !== 'FILAMENT');
    const sourceContentNodes = sourceNodes.filter(node => node.type !== 'DOMAIN' && node.type !== 'FILAMENT');

    if (expandAll) {
      const ids = new Set(baseNodes.map(node => node.id));
      return {
        nodes: baseNodes,
        edges: filtered.edges.filter(edge => (learningVisible || !edge.is_learning) && ids.has(edge.from) && ids.has(edge.to)),
      };
    }

    if (!rootExpanded) return { nodes: rootNode ? [rootNode] : branchDomains.slice(0, 1), edges: [] };

    if (!expandedDomain) {
      if (!rootNode) return { nodes: branchDomains, edges: [] };
      const edges = branchDomains.map(node => ({
        id: 'atlas.root.branch.' + node.id,
        from: rootNode.id,
        to: node.id,
        kind: 'OWNS' as const,
        weight: 0.92,
        explanation: node.domain === 'NEXO'
          ? 'Nexo Core agrupa operações, runtime, MCP e engenharia.'
          : node.label + ' é um ramo de conhecimento dentro do Atlas Nexo.',
      }));
      return { nodes: [rootNode, ...branchDomains], edges };
    }

    const topDomain = expandedDomain as AtlasTopDomain;
    const domainNode = branchDomains.find(node => node.domain === topDomain);
    if (!domainNode) return { nodes: domainNodes, edges: [] };

    const domainChildren = contentNodes.filter(node => node.domain === topDomain);
    const sourceDomainChildren = sourceContentNodes.filter(node => node.domain === topDomain);

    const learningOverlayForTargets = (targetIds: Set<string>, remap = new Map<string, string>()) => {
      if (!learningVisible) return { nodes: [] as GraphNode[], edges: [] as typeof filtered.edges };
      const filamentIds = new Set<string>();
      const mapped = new Map<string, (typeof filtered.edges)[number]>();
      for (const edge of filtered.edges) {
        if (!edge.is_learning) continue;
        const fromTarget = targetIds.has(edge.from);
        const toTarget = targetIds.has(edge.to);
        if (!fromTarget && !toTarget) continue;
        const otherId = fromTarget ? edge.to : edge.from;
        const other = baseNodes.find(node => node.id === otherId);
        if (other?.type !== 'FILAMENT') continue;
        filamentIds.add(otherId);
        const from = remap.get(edge.from) ?? edge.from;
        const to = remap.get(edge.to) ?? edge.to;
        if (from === to) continue;
        const key = from + '|' + to + '|' + edge.kind;
        if (!mapped.has(key)) mapped.set(key, {
          ...edge,
          id: edge.id + ':atlas-overlay:' + encodeURIComponent(from) + ':' + encodeURIComponent(to),
          from,
          to,
        });
      }
      return {
        nodes: baseNodes.filter(node => filamentIds.has(node.id)),
        edges: [...mapped.values()],
      };
    };

    if (!expandedCampaign && !expandedCluster) {
      const groups = new Map<string, GraphNode[]>();
      for (const node of sourceDomainChildren) {
        const key = atlasSubdomainOf(node);
        groups.set(key, [...(groups.get(key) ?? []), node]);
      }
      const subdomainNodes = [...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([subdomain, members]) => semanticSubdomainNode(topDomain, subdomain, members.length, members[0] ?? null));
      const edges = subdomainNodes.map(node => ({
        id: 'atlas.subdomain.edge.' + topDomain + '.' + node.id,
        from: domainNode.id,
        to: node.id,
        kind: 'OWNS' as const,
        weight: 0.86,
        explanation: 'Subdomínio semântico derivado das entidades reais desta projeção.',
      }));
      const memberToSubdomain = new Map<string, string>();
      for (const [subdomain, members] of groups) {
        const renderedId = atlasSubdomainNodeId(topDomain, subdomain);
        for (const member of members) memberToSubdomain.set(member.id, renderedId);
      }
      const overlay = learningOverlayForTargets(new Set(sourceDomainChildren.map(node => node.id)), memberToSubdomain);
      return { nodes: [domainNode, ...subdomainNodes, ...overlay.nodes], edges: [...edges, ...overlay.edges] };
    }

    if (expandedCampaign) {
      const sourceMembers = sourceDomainChildren.filter(node => atlasSubdomainOf(node) === expandedCampaign);
      const members = domainChildren.filter(node => atlasSubdomainOf(node) === expandedCampaign);
      const subdomain = semanticSubdomainNode(topDomain, expandedCampaign, sourceMembers.length, sourceMembers[0] ?? null);
      const grouped = new Map<string, GraphNode[]>();
      for (const node of sourceMembers) {
        if (!node.campaign_id) continue;
        grouped.set(node.campaign_id, [...(grouped.get(node.campaign_id) ?? []), node]);
      }
      const campaignNodes = [...grouped.entries()].map(([campaignId, groupedMembers]) =>
        campaignNode(topDomain, campaignId, groupedMembers.length, groupedMembers.find(node => node.type !== 'TEST') ?? groupedMembers[0] ?? null));
      const standalone = members.filter(node => !node.campaign_id);
      const children = [...campaignNodes, ...standalone].sort((a, b) =>
        (a.type === 'CAMPAIGN' ? 0 : 1) - (b.type === 'CAMPAIGN' ? 0 : 1) || a.label.localeCompare(b.label));
      const edges = children.map(node => ({
        id: 'atlas.subdomain.member.' + subdomain.id + '.' + node.id,
        from: subdomain.id,
        to: node.id,
        kind: 'OWNS' as const,
        weight: node.type === 'CAMPAIGN' ? 0.9 : 0.66,
        explanation: node.type === 'CAMPAIGN'
          ? 'Campanha científica agregada; testes permanecem na Tower/runtime.'
          : node.type + ' pertence ao subdomínio ' + subdomain.label + ' nesta projeção.',
      }));
      const remap = new Map<string, string>();
      for (const [campaignId, groupedMembers] of grouped) {
        const renderedId = campaignNodeId(topDomain, campaignId);
        for (const member of groupedMembers) remap.set(member.id, renderedId);
      }
      const overlay = learningOverlayForTargets(new Set(sourceMembers.map(node => node.id)), remap);
      return { nodes: [subdomain, ...children, ...overlay.nodes], edges: [...edges, ...overlay.edges] };
    }

    // Type cluster remains only as a compatibility fallback for old deep links.
    const children = domainChildren.filter(node => node.type === expandedCluster);
    const overlay = learningOverlayForTargets(new Set(children.map(node => node.id)));
    const nodes = [domainNode, ...children, ...overlay.nodes];
    const ids = new Set(nodes.map(node => node.id));
    const structural = filtered.edges.filter(edge => !edge.is_learning && ids.has(edge.from) && ids.has(edge.to));
    return { nodes, edges: [...structural, ...overlay.edges] };
  }, [expandAll, expandedCampaign, expandedCluster, expandedDomain, filtered, learningVisible, rootExpanded]);
  const isMacroOverview = rootExpanded && !expandAll && !expandedDomain && !expandedCampaign && !expandedCluster;
  const placed = useMemo(() => {
    if (isMacroOverview) return layoutMacroDomains(renderGraph.nodes, isMobile);
    return layoutFromGalaxy(renderGraph.nodes, galaxySnapshot, atlasSubdomainOf);
  }, [galaxySnapshot, isMacroOverview, isMobile, renderGraph.nodes]);
  const legend = useMemo(() => legendOf(renderGraph.nodes.filter(node => !clusterFromId(node.id) && !campaignFromId(node.id) && !atlasSubdomainFromId(node.id))), [renderGraph.nodes]);
  const effectiveSelectedId = resolveSelection3D(placed, selectedId);
  const localRelations = useMemo(() => localFocusId ? relationsOf(filtered, localFocusId) : { upstream: [], downstream: [] }, [filtered, localFocusId]);
  const localNeighborIds = useMemo(() => new Set([...localRelations.upstream, ...localRelations.downstream].map(relation => relation.node.id)), [localRelations]);
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

  const active = filterCount(filters);
  const handleGraphSelect = (id: string | null) => {
    if (id) {
      if (id === 'atlas.root.nexo') {
        galaxyRef.current?.focusDomain(id);
        audio.playDomainTransition();
        setRootExpanded(true);
        setExpandAll(false);
        setExpandedDomain(null);
        setExpandedCampaign(null);
        setExpandedCluster(null);
        setLocalFocusId(null);
        onSelect(null);
        return;
      }
      const semanticSubdomain = atlasSubdomainFromId(id);
      if (semanticSubdomain) {
        galaxyRef.current?.focusSubdomain(id);
        setExpandedDomain(semanticSubdomain.domain);
        setExpandedCampaign(semanticSubdomain.subdomain);
        setExpandedCluster(null);
        setRootExpanded(true);
        setExpandAll(false);
        onSelect(null);
        return;
      }
      const campaign = campaignFromId(id);
      if (campaign) {
        galaxyRef.current?.focusSubdomain(id);
        setExpandedDomain(campaign.domain);
        setExpandedCampaign(campaign.campaignId);
        setExpandedCluster(null);
        setRootExpanded(true);
        setExpandAll(false);
        onSelect(null);
        return;
      }
      const cluster = clusterFromId(id);
      if (cluster) {
        galaxyRef.current?.focusSubdomain(id);
        setExpandedDomain(cluster.domain);
        setExpandedCampaign(null);
        setExpandedCluster(cluster.type);
        setRootExpanded(true);
        setExpandAll(false);
        onSelect(null);
        return;
      }
      const node = graphForView.nodes.find(candidate => candidate.id === id);
      if (node?.type === 'DOMAIN') {
        if (filters.domains.length && !filters.domains.includes(node.domain)) {
          setFilters({ ...filters, domains: [node.domain] });
        }
        galaxyRef.current?.focusDomain(id);
        audio.playDomainTransition();
        setRootExpanded(true);
        setExpandAll(false);
        setExpandedDomain(node.domain);
        setExpandedCampaign(null);
        setExpandedCluster(null);
      } else {
        setExpandAll(true);
        setRootExpanded(true);
        setLocalFocusId(id);
        galaxyRef.current?.focusEntity(id);
        audio.playSelection();
      }
    } else {
      setLocalFocusId(null);
    }
    onSelect(id);
  };

  // Search-to-fly: an exact id match wins, otherwise the first id/label
  // substring match. Reveals the match (full-graph view, so hierarchy never
  // hides it), flies the camera, selects it and opens the inspector.
  const flyToEntity = (id: string) => {
    setLocalFocusId(id);
    setExpandAll(true);
    setRootExpanded(true);
    onSelect(id);
    requestAnimationFrame(() => galaxyRef.current?.focusEntity(id));
    audio.playSelection();
  };
  const handleSearchSubmit = () => {
    const query = filters.search.trim().toLowerCase();
    if (!query) return;
    const pool = state.graph.nodes.filter(node => node.type !== 'DOMAIN' && node.type !== 'TEST');
    const match = pool.find(node => node.id.toLowerCase() === query)
      ?? pool.find(node => node.id.toLowerCase().includes(query) || node.label.toLowerCase().includes(query));
    if (match) flyToEntity(match.id);
  };

  const layerActive = (layer: LayerId): boolean => {
    const types = LAYER_TYPES[layer];
    return types.length > 0 && types.every(type => filters.types.includes(type));
  };
  const toggleLayer = (layer: LayerId) => {
    const types = LAYER_TYPES[layer];
    if (types.length === 0) return;
    const isActive = layerActive(layer);
    const next = isActive
      ? filters.types.filter(type => !types.includes(type))
      : [...new Set([...filters.types, ...types])];
    setFilters({ ...filters, types: next });
  };
  const runPreset = (presetId: (typeof PRESETS)[number]['id']) => {
    const preset = PRESETS.find(candidate => candidate.id === presetId);
    if (!preset) return;
    setFilters(applyPreset(preset, filters));
    if (presetId === 'ATTENTION' || presetId === 'LEARNING') setMode('operate');
  };

  const needsYouFirstId = galaxySnapshot.needs_you[0]?.entity_id ?? null;
  const runTourRoute = (routeId: TourRouteId) => {
    const route = tourRouteById(routeId);
    if (!route) return;
    const action = resolveTourAction(route, { needsYouFirstId });
    setTourOpen(false);
    setActiveTourRoute(routeId);
    audio.playDomainTransition();
    if (action.kind === 'RESET') { goHome(); return; }
    if (action.kind === 'FOCUS_DOMAIN') {
      const requestedDomain = action.domain === 'ENGINEERING' ? 'NEXO' : action.domain;
      const domainNode = graphForView.nodes.find(node => node.type === 'DOMAIN' && node.domain === requestedDomain);
      if (domainNode) handleGraphSelect(domainNode.id);
      return;
    }
    setMode('operate');
    setOpenPanel(action.panel);
    if (action.focusEntityId) galaxyRef.current?.focusEntity(action.focusEntityId);
  };
  const exitTour = () => { setActiveTourRoute(null); goHome(); };

  // Deep links: ?mode=&domain=&subdomain=&entity=&panel= reconstruct focus/panel
  // once on mount. The galaxy never leaves this page for any of this.
  useEffect(() => {
    const initial = parseGalaxyDeepLink(window.location.search);
    if (initial.mode === 'operate') setMode('operate');
    if (initial.panel) { setMode('operate'); setOpenPanel(initial.panel); }
    if (initial.entity) {
      setExpandAll(true);
      onSelect(initial.entity);
    } else if (initial.subdomain) {
      const semanticSubdomain = atlasSubdomainFromId(initial.subdomain);
      const campaign = campaignFromId(initial.subdomain);
      const cluster = clusterFromId(initial.subdomain);
      if (semanticSubdomain) {
        setExpandedDomain(semanticSubdomain.domain);
        setExpandedCampaign(semanticSubdomain.subdomain);
        setExpandedCluster(null);
      } else if (campaign) {
        setExpandedDomain(campaign.domain);
        setExpandedCampaign(campaign.campaignId);
        setExpandedCluster(null);
      } else if (cluster) {
        setExpandedDomain(cluster.domain);
        setExpandedCampaign(null);
        setExpandedCluster(cluster.type);
      }
    } else if (initial.domain && (DOMAINS as string[]).includes(initial.domain)) {
      setExpandedDomain(initial.domain as GraphNode['domain']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the deep-linked entity is actually part of the rendered graph, fly
  // the camera to it exactly once.
  useEffect(() => {
    if (deepLinkAppliedRef.current || placed.length === 0) return;
    const initial = parseGalaxyDeepLink(window.location.search);
    if (initial.entity && placed.some(node => node.id === initial.entity)) {
      galaxyRef.current?.focusEntity(initial.entity);
    }
    deepLinkAppliedRef.current = true;
  }, [placed]);

  // Keep the URL in sync with camera/panel state (no reload, no history spam).
  useEffect(() => {
    const subdomain = expandedDomain && expandedCampaign
      ? atlasSubdomainNodeId(expandedDomain as AtlasTopDomain, expandedCampaign)
      : expandedDomain && expandedCluster
        ? clusterIdFor(expandedDomain, expandedCluster)
        : null;
    const search = buildGalaxySearch({
      mode, domain: expandedDomain, subdomain, entity: effectiveSelectedId, panel: openPanel,
    });
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, [mode, expandedDomain, expandedCampaign, expandedCluster, effectiveSelectedId, openPanel]);

  // Optional read-only WebMCP surface. registerGalaxyWebMcpTools is a no-op
  // whenever no WebMCP host exists on window, which is every browser today —
  // the galaxy never depends on this running.
  useEffect(() => {
    registerGalaxyWebMcpTools({
      getSnapshot: () => galaxySnapshot,
      focusEntity: id => { const ok = Boolean(galaxyRef.current?.focusEntity(id)); if (ok) flyToEntity(id); return ok; },
      focusDomain: id => Boolean(galaxyRef.current?.focusDomain(id)),
      startTour: routeId => { runTourRoute(routeId as TourRouteId); return true; },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxySnapshot]);

  const goBack = () => {
    if (expandAll) {
      setExpandAll(false);
      setRootExpanded(true);
    } else if (expandedCampaign) {
      setExpandedCampaign(null);
    } else if (expandedCluster) {
      setExpandedCluster(null);
    } else if (expandedDomain) {
      setExpandedDomain(null);
    } else {
      setRootExpanded(false);
    }
    onSelect(null);
  };

  const expandEverything = () => {
    galaxyRef.current?.reset();
    setRootExpanded(true);
    setExpandedDomain(null);
    setExpandedCampaign(null);
    setExpandedCluster(null);
    setExpandAll(true);
    onSelect(null);
  };

  const goHome = () => {
    galaxyRef.current?.reset();
    if (filters.domains.length) setFilters({ ...filters, domains: [] });
    setRootExpanded(false);
    setExpandAll(false);
    setExpandedDomain(null);
    setExpandedCampaign(null);
    setExpandedCluster(null);
    onSelect(null);
  };

  return (
    <div className={`atlas-layout${isMobile ? ' mobile' : ''}`}>
      {!introDone && <GalaxyIntro onDone={() => setIntroDone(true)} />}

      <div className="atlas-toolbar">
        <div className="atlas-mode-toggle" role="group" aria-label="Modo de visualização">
          <button type="button" className={mode === 'explore' ? 'active' : ''} aria-pressed={mode === 'explore'}
            onClick={() => setMode('explore')}>Explore</button>
          <button type="button" className={mode === 'operate' ? 'active' : ''} aria-pressed={mode === 'operate'}
            onClick={() => setMode('operate')}>Operate</button>
        </div>
        <div className="atlas-search">
          <span aria-hidden="true">⌕</span>
          <input value={filters.search} placeholder={isMobile ? "Buscar no Atlas…" : "Buscar e voar até uma entidade, ou filtrar por nome/resumo"}
            aria-label="Buscar no grafo" onChange={e => setFilters({ ...filters, search: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit(); }} />
        </div>
        <button className={`filter-toggle${active ? ' has-filters' : ''}`} onClick={() => setPanelOpen(v => !v)}
          aria-expanded={panelOpen}>
          Filtros{active > 0 && <b>{active}</b>}
        </button>
        {active > 0 && (
          <button className="text-button" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar</button>
        )}
        <button className={`filter-toggle sound-toggle${audio.muted ? '' : ' has-filters'}`} type="button"
          aria-pressed={!audio.muted} onClick={audio.toggle}>
          Som <b>{audio.muted ? 'OFF' : 'ON'}</b>
        </button>
        <div className="atlas-tour">
          <button type="button" className={`filter-toggle${activeTourRoute ? ' has-filters' : ''}`}
            aria-expanded={tourOpen} aria-haspopup="menu" onClick={() => setTourOpen(v => !v)}>Tour</button>
          {tourOpen && (
            <div className="atlas-tour-menu" role="menu" aria-label="Rotas do tour">
              {TOUR_ROUTES.map(route => (
                <button key={route.id} role="menuitem" type="button"
                  className={activeTourRoute === route.id ? 'active' : ''}
                  onClick={() => runTourRoute(route.id)}>
                  <strong>{route.label}</strong>
                  <span>{route.description}</span>
                </button>
              ))}
            </div>
          )}
          {activeTourRoute && (
            <button type="button" className="text-button" onClick={exitTour}>Sair do tour</button>
          )}
        </div>
        <button className={`filter-toggle learning-toggle${learningVisible ? ' has-filters' : ''}`} type="button"
          aria-pressed={learningVisible} onClick={() => setLearningVisible(value => !value)}>
          Learning Filaments <b>{learningVisible ? 'ON' : 'OFF'}</b>
        </button>
        {learningEdges.length > 0 && (
          <span className="atlas-learning-meta"
            aria-label={`${learningEdges.length} filamentos do backend: ${learningInterDomain} interdomínio e ${learningIntraDomain} intradomínio`}>
            <i className="atlas-learning-key inter" aria-hidden="true" />{learningInterDomain} interdomínio
            <i className="atlas-learning-key intra" aria-hidden="true" />{learningIntraDomain} intradomínio
          </span>
        )}
        <span className="atlas-count">{renderGraph.nodes.length} nós · {renderGraph.edges.length} relações</span>
        <span className={`atlas-snapshot-age freshness-${galaxyState.freshness.toLowerCase()}`}
          title={galaxyState.source === 'PUBLISHED' ? 'Snapshot publicado' : 'Fallback derivado do SystemState atual'}>
          {galaxySnapshotAgeLabel(galaxySnapshot.generated_at)}
        </span>
        <div className="atlas-explorer-state" role="status">
          <span><b>Visão:</b> Camadas · {expandAll ? 'grafo completo' : expandedCampaign ? `${expandedDomain} · ${expandedCampaign}` : expandedCluster ? `${expandedDomain} · ${label(expandedCluster)}` : expandedDomain ?? 'domínios'}</span>
          {(expandAll || expandedDomain || expandedCluster) && <button type="button" aria-label="Voltar um nível no grafo" onClick={goBack}>Voltar nível</button>}
          {!expandAll && <button type="button" aria-label="Mostrar o grafo completo" onClick={expandEverything}>Mostrar tudo</button>}
          {expandedCluster && <span className="atlas-explorer-subtree">Subtree: {label(expandedCluster)}</span>}
        </div>
        <div className="atlas-graph-actions" role="group" aria-label="Navegação estrutural do grafo">
          <button type="button" aria-label="Mostrar o grafo completo" onClick={expandEverything} disabled={expandAll}>Mostrar grafo completo</button>
          <button type="button" aria-label="Voltar à visão por domínios" onClick={goHome}
            disabled={!expandAll && !expandedDomain && !expandedCluster}>Raiz Nexo</button>
        </div>
      </div>

      {panelOpen && (
        <div className="atlas-filters">
          <div className="chip-group">
            <span className="eyebrow">CAMADAS</span>
            <div className="chip-row">
              {(Object.keys(LAYER_TYPES) as LayerId[]).filter(layer => LAYER_TYPES[layer].length > 0).map(layer => (
                <button key={layer} type="button" className={`chip${layerActive(layer) ? ' on' : ''}`}
                  aria-pressed={layerActive(layer)} onClick={() => toggleLayer(layer)}>{layer.replace('_', ' ')}</button>
              ))}
            </div>
          </div>
          <div className="chip-group">
            <span className="eyebrow">PRESETS</span>
            <div className="chip-row">
              {PRESETS.map(preset => (
                <button key={preset.id} type="button" className="chip" onClick={() => runPreset(preset.id)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <ChipGroup title="DOMÍNIO" values={ATLAS_TOP_DOMAINS} selected={filters.domains} onToggle={v => toggle('domains', v)} />
          <ChipGroup title="TIPO" values={GRAPH_NODE_TYPES.filter(type => type !== 'TEST')} selected={filters.types} onToggle={v => toggle('types', v)} />
          <ChipGroup title="ESTADO" values={[...PROJECTION_STATES, ...CAPABILITY_STATUSES]}
            selected={filters.states} onToggle={v => toggle('states', v)} />
          <ChipGroup title="FRESHNESS" values={FRESHNESS_VALUES} selected={filters.freshness} onToggle={v => toggle('freshness', v)} />
          <ChipGroup title="AUTORIDADE" values={AUTHORITIES} selected={filters.authorities} onToggle={v => toggle('authorities', v)} />
          <ChipGroup title="RELAÇÃO" values={RELATION_KINDS} selected={filters.relations} onToggle={v => toggle('relations', v)} />
        </div>
      )}

      {mode === 'operate' && (
        <OperateHUD snapshot={galaxySnapshot} openPanel={openPanel}
          onOpenPanel={panel => setOpenPanel(panel)} onClosePanel={() => setOpenPanel(null)}
          onFocusEntity={id => { flyToEntity(id); setOpenPanel(null); }} />
      )}

      {!isMacroOverview && !expandAll && (
        <nav className="atlas-breadcrumb" aria-label="Caminho do Atlas">
          <button type="button" onClick={goHome}>Atlas</button>
          {expandedDomain && (
            <>
              <span aria-hidden="true">/</span>
              <button type="button" onClick={() => {
                setExpandedCampaign(null);
                setExpandedCluster(null);
                onSelect(null);
              }}>{expandedDomain}</button>
            </>
          )}
          {expandedCampaign && (
            <>
              <span aria-hidden="true">/</span>
              <strong>{expandedCampaign === NO_CAMPAIGN ? 'SEM CAMPANHA' : expandedCampaign}</strong>
            </>
          )}
          {expandedCluster && (
            <>
              <span aria-hidden="true">/</span>
              <strong>{label(expandedCluster)}</strong>
            </>
          )}
          <button className="atlas-breadcrumb-back" type="button" onClick={goBack}>← Voltar</button>
        </nav>
      )}

      <div className="atlas-body">
        <div className="atlas-stage atlas-stage-3d">
          {renderGraph.nodes.length === 0
            ? <EmptyState title="Nenhuma entidade sobrevive a este filtro."
                description="Um grafo vazio aqui é resultado do filtro, não ausência de dados no sistema."
                hint="Remova um critério para voltar a ver o mapa." />
            : <>
                <AtlasGalaxyRenderer
                  ref={galaxyRef}
                  nodes={placed}
                  edges={renderGraph.edges}
                  selectedId={effectiveSelectedId}
                  onSelect={handleGraphSelect}
                  viewMode={isMacroOverview ? 'macro' : 'detail'}
                />
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

        {!isMobile && !isMacroOverview && (
          <aside className="atlas-inspector">
            {selected
              ? <EntityInspector node={selected} upstream={relations.upstream} downstream={relations.downstream}
                  onSelect={handleGraphSelect} />
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
            onSelect={handleGraphSelect} onClose={() => onSelect(null)} />
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
                    {filament.scope && <span className="filament-kind">{filament.scope === 'INTER_DOMAIN' ? 'INTERDOMÍNIO' : 'INTRADOMÍNIO'}</span>}
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
