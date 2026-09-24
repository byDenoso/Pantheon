// Mapa · Galáxia. Positions come from the published galaxy snapshot, which the
// server compiler derives from Tower semantics (NEXO bulge, one arm per domain,
// subdomains as arm segments, tests as dust). The Three.js renderer adds the
// procedural starfield around them.
import { useEffect, useMemo, useState } from 'react';
import { GalaxyThree3D } from '../components/GalaxyThree3D.tsx';
import type { GraphNode, GraphNodeType } from '../contracts/system.ts';
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

export function GalaxyView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
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

  // The galaxy always shows every published entity: it reads best as the whole
  // system. Lenses (Operação, Ciência, Sistema, Aprendizado, Tudo) drive 2D/3D.
  const nodes = useMemo(() => (entities ?? []).map(toNode), [entities]);

  if (failed) return <div className="nexo-graph-fallback" role="status">Galáxia indisponível neste instante. Use 2D ou 3D.</div>;
  if (!entities) return <div className="nexo-graph-fallback" role="status">Compilando a galáxia…</div>;
  return (
    <div className="atlas3d-shell atlas-three-field-shell atlas-galaxy-view" data-renderer="galaxy-spiral">
      <GalaxyThree3D
        nodes={nodes}
        edges={[]}
        selectedId={selectedId}
        onSelect={id => { if (id) onSelect(id); }}
        onFailure={() => setFailed(true)}
        viewMode="detail"
      />
    </div>
  );
}
