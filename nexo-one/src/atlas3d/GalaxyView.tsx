// Mapa · Galáxia. Positions come from the published galaxy snapshot, which the
// server compiler derives from Tower semantics (NEXO bulge, one arm per domain,
// subdomains as arm segments, tests as dust). The Three.js renderer adds the
// procedural starfield around them.
import { useEffect, useMemo, useState } from 'react';
import { GalaxyThree3D } from '../components/GalaxyThree3D.tsx';
import type { GraphEdge, GraphNode, GraphNodeType } from '../contracts/system.ts';
import type { AtlasMetroModel } from './atlasAdapter.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';

const SCALE = 0.55;
const ENDPOINT = import.meta.env?.VITE_GALAXY_ENDPOINT?.trim() || './galaxy/latest.json';
const TYPE: Record<string, GraphNodeType> = {
  TEST: 'TEST', WORK: 'ACTION', CAPABILITY: 'CAPABILITY', HYPOTHESIS: 'CLAIM', RESULT: 'EFFECT',
};
const RADIUS: Partial<Record<GraphNodeType, number>> = { TEST: 1.4, ACTION: 1.2, CAPABILITY: 1.0 };

interface RawEntity {
  id: string; canonical_id?: string; kind?: string; title?: string; status?: string | null;
  visual_domain?: string; layout?: { x?: number; y?: number; z?: number };
}

function toNode(entity: RawEntity): PlacedNode3D {
  const type = TYPE[String(entity.kind || '').toUpperCase()] ?? 'ACTION';
  const domain = (entity.visual_domain || 'NEXO') as GraphNode['domain'];
  return {
    id: entity.canonical_id || entity.id,
    type,
    label: entity.title || entity.canonical_id || entity.id,
    domain,
    state: 'LIVE',
    authority_class: 'DERIVED',
    source_ref: 'galaxy://published/latest',
    source_revision: '',
    fingerprint: '',
    freshness: { state: 'RECENT', observed_at: null, ttl_seconds: null },
    checked_at: '',
    summary: entity.status ? `status ${entity.status}` : '',
    x: (entity.layout?.x ?? 0) * SCALE,
    y: (entity.layout?.y ?? 0) * SCALE,
    z: (entity.layout?.z ?? 0) * SCALE,
    radius: RADIUS[type] ?? 1.2,
  } as PlacedNode3D;
}

const bare = (id: string) => id.replace(/^[a-z_]+:/i, '');

export function GalaxyView({ model, selectedId, onSelect }: { model: AtlasMetroModel; selectedId: string | null; onSelect: (id: string) => void }) {
  const [entities, setEntities] = useState<RawEntity[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { signal: controller.signal, cache: 'no-cache' })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(snapshot => setEntities(Array.isArray(snapshot?.entities) ? snapshot.entities : []))
      .catch(error => { if (error?.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, []);

  // The active lens decides which stars are data; everything else stays only as
  // procedural background. Lens hubs (domains, stations) become labeled stars at
  // the centroid of their member stars so learning links can be drawn as filaments.
  const allNodes = useMemo(() => (entities ?? []).map(toNode), [entities]);
  const { nodes, edges } = useMemo(() => {
    const stars = new Map(allNodes.map(node => [bare(node.id), node]));
    const placed = new Map<string, PlacedNode3D>();
    const keyOf = (id: string) => bare(model.nodeMap.get(id)?.sourceId || id);
    for (const node of model.nodes) {
      const star = stars.get(keyOf(node.id));
      if (star) placed.set(node.id, { ...star, id: node.id });
    }
    const centroid = (id: string, seen = new Set<string>()): { x: number; y: number; z: number; n: number } => {
      const acc = { x: 0, y: 0, z: 0, n: 0 };
      if (seen.has(id)) return acc;
      seen.add(id);
      for (const child of model.childrenMap.get(id) || []) {
        const p = placed.get(child);
        if (p) { acc.x += p.x; acc.y += p.y; acc.z += p.z; acc.n += 1; }
        const sub = centroid(child, seen);
        acc.x += sub.x; acc.y += sub.y; acc.z += sub.z; acc.n += sub.n;
      }
      return acc;
    };
    const DOMAIN_ANCHOR: Record<string, { x: number; y: number }> = {
      NEXO: { x: 0, y: 0 }, SCIENCE: { x: 30, y: 4 }, OLYMPUS: { x: -30, y: -4 }, ENGINEERING: { x: 0, y: 30 },
    };
    for (const node of model.nodes) {
      if (placed.has(node.id)) continue;
      const c = centroid(node.id);
      const anchor = DOMAIN_ANCHOR[node.domain] ?? DOMAIN_ANCHOR.NEXO;
      const hubType: GraphNodeType = node.entityType === 'hub' ? 'DOMAIN' : 'SUBDOMAIN';
      placed.set(node.id, {
        ...toNode({ id: node.id, title: node.name, visual_domain: node.domain, kind: 'HUB' }),
        type: hubType,
        x: c.n ? c.x / c.n : anchor.x,
        y: c.n ? c.y / c.n : anchor.y,
        z: c.n ? c.z / c.n : 0,
        radius: hubType === 'DOMAIN' ? 3.2 : 2.2,
      });
    }
    const nodes = [...placed.values()];
    const edges: GraphEdge[] = model.crossLinks
      .filter(link => placed.has(link.source) && placed.has(link.target))
      .map(link => ({
        id: link.id,
        from: link.source,
        to: link.target,
        kind: 'DERIVES_FROM',
        weight: link.weight,
        explanation: link.label,
        is_learning: link.isLearning || undefined,
        learning_scope: link.learningScope ?? undefined,
        learning_ref: link.learningRef ?? undefined,
      } as GraphEdge));
    return { nodes, edges };
  }, [allNodes, model]);

  if (failed) return <div className="nexo-graph-fallback" role="status">Galáxia indisponível neste instante. Use 2D ou 3D.</div>;
  if (!entities) return <div className="nexo-graph-fallback" role="status">Compilando a galáxia…</div>;
  return (
    <div className="atlas3d-shell atlas-three-field-shell atlas-galaxy-view" data-renderer="galaxy-spiral">
      <GalaxyThree3D
        nodes={nodes}
        edges={edges}
        selectedId={selectedId}
        onSelect={id => { if (id) onSelect(id); }}
        onFailure={() => setFailed(true)}
        viewMode="detail"
      />
    </div>
  );
}
