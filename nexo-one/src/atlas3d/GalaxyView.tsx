// Mapa · Galáxia. The shape is an indicator of NEXO's state: the server
// compiler derives arm mass/length/thickness/fragmentation, bridges and core
// from Tower semantics (galaxy-morphology.mjs) and publishes it with shape
// metrics in the snapshot. This view renders it and never reinterprets it.
import { useEffect, useMemo, useState } from 'react';
import { GalaxyThree3D, type GalaxyMorphology } from '../components/GalaxyThree3D.tsx';
import type { GraphNode, GraphNodeType } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';

const SCALE = 0.275; // matches G_SCALE in GalaxyThree3D (half size)
const ENDPOINT = import.meta.env?.VITE_GALAXY_ENDPOINT?.trim() || './galaxy/latest.json';
const TYPE: Record<string, GraphNodeType> = {
  TEST: 'TEST', WORK: 'ACTION', CAPABILITY: 'CAPABILITY', HYPOTHESIS: 'CLAIM', RESULT: 'EFFECT',
};
const RADIUS: Partial<Record<GraphNodeType, number>> = { TEST: 1.4, ACTION: 1.2, CAPABILITY: 1.0 };
const GLOW_LEVELS = [
  { id: 'soft', label: 'Suave', value: 0.6 },
  { id: 'medium', label: 'Médio', value: 0.85 },
  { id: 'strong', label: 'Forte', value: 1.1 },
] as const;
const GLOW_KEY = 'nexo.galaxy.glow.v1';

interface RawEntity {
  id: string; canonical_id?: string; kind?: string; title?: string; status?: string | null;
  visual_domain?: string; layout?: { x?: number; y?: number; z?: number };
}

interface Metrics {
  center_of_mass: { x: number; y: number };
  asymmetry: number;
  domain_entropy_bits: number;
  radial_ratio: number;
  cross_link_density: number;
  entities_by_domain: Record<string, number>;
}
type MetricsDelta = Partial<Record<'asymmetry' | 'domain_entropy_bits' | 'radial_ratio' | 'cross_link_density', number | null>>;

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

function readGlow(): number {
  try {
    const stored = window.localStorage.getItem(GLOW_KEY);
    const level = GLOW_LEVELS.find(item => item.id === stored);
    return level ? level.value : GLOW_LEVELS[1].value;
  } catch {
    return GLOW_LEVELS[1].value;
  }
}

const signed = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && value !== 0 ? ` (${value > 0 ? '+' : ''}${value.toFixed(digits)})` : '';

export function GalaxyView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const [entities, setEntities] = useState<RawEntity[] | null>(null);
  const [morphology, setMorphology] = useState<(GalaxyMorphology & { metrics?: Metrics; metrics_delta?: MetricsDelta | null }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [glow, setGlow] = useState<number>(readGlow);

  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { signal: controller.signal, cache: 'no-cache' })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(snapshot => {
        setEntities(Array.isArray(snapshot?.entities) ? snapshot.entities : []);
        setMorphology(snapshot?.morphology && typeof snapshot.morphology === 'object' ? snapshot.morphology : null);
      })
      .catch(error => { if (error?.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, []);

  const chooseGlow = (level: (typeof GLOW_LEVELS)[number]) => {
    setGlow(level.value);
    try { window.localStorage.setItem(GLOW_KEY, level.id); } catch { /* per-viewer convenience only */ }
  };

  // The galaxy always shows every published entity: it reads best as the whole
  // system. Lenses (Operação, Ciência, Sistema, Aprendizado, Tudo) drive 2D/3D.
  const nodes = useMemo(() => (entities ?? []).map(toNode), [entities]);
  const metrics = morphology?.metrics;
  const delta = morphology?.metrics_delta ?? null;

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
        morphology={morphology}
        glow={glow}
      />
      <div className="galaxy-hud">
        <div className="galaxy-glow" role="group" aria-label="Intensidade do brilho">
          <span>Brilho</span>
          {GLOW_LEVELS.map(level => (
            <button key={level.id} type="button" aria-pressed={glow === level.value} className={glow === level.value ? 'active' : ''} onClick={() => chooseGlow(level)}>
              {level.label}
            </button>
          ))}
        </div>
        {metrics && (
          <dl className="galaxy-metrics" aria-label="Métricas da forma da galáxia">
            <div><dt>Assimetria</dt><dd>{metrics.asymmetry.toFixed(2)}{signed(delta?.asymmetry)}</dd></div>
            <div><dt>Entropia</dt><dd>{metrics.domain_entropy_bits.toFixed(2)} bits{signed(delta?.domain_entropy_bits)}</dd></div>
            <div><dt>Razão radial</dt><dd>{metrics.radial_ratio.toFixed(2)}{signed(delta?.radial_ratio)}</dd></div>
            <div><dt>Pontes</dt><dd>{metrics.cross_link_density.toFixed(3)}{signed(delta?.cross_link_density, 3)}</dd></div>
            <div className="galaxy-mass">
              <dt>Massa</dt>
              <dd>{Object.entries(metrics.entities_by_domain).sort((a, b) => b[1] - a[1]).map(([domain, count]) => (
                <span key={domain} data-domain={domain}>{domain} {count}</span>
              ))}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
