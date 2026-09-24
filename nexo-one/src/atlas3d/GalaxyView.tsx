// Mapa · Galáxia. The shape is an indicator of NEXO's state: the server
// compiler derives arm mass/length/thickness/fragmentation, bridges and core
// from Tower semantics (galaxy-morphology.mjs) and publishes it with shape
// metrics in the snapshot. This view renders it and never reinterprets it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EventGlyph, GalaxyThree3D, type GalaxyEvent, type GalaxyMorphology } from '../components/GalaxyThree3D.tsx';
import type { GraphNode, GraphNodeType } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';

const SCALE = 0.36; // matches G_SCALE in GalaxyThree3D (half size)
const ENDPOINT = import.meta.env?.VITE_GALAXY_ENDPOINT?.trim() || './galaxy/latest.json';
const TYPE: Record<string, GraphNodeType> = {
  TEST: 'TEST', WORK: 'ACTION', CAPABILITY: 'CAPABILITY', HYPOTHESIS: 'CLAIM', RESULT: 'EFFECT',
};
const RADIUS: Partial<Record<GraphNodeType, number>> = { TEST: 1.4, ACTION: 1.2, CAPABILITY: 1.0 };
const GLOW_LEVELS = [
  { id: 'soft', label: 'Suave', value: 0.15 },
  { id: 'medium', label: 'Médio', value: 0.21 },
  { id: 'strong', label: 'Forte', value: 0.28 },
] as const;
const GLOW_KEY = 'nexo.galaxy.glow.v1';
const EVENTS_KEY = 'nexo.galaxy.events-off.v1';

function readHiddenEvents(): string[] {
  try { const v = JSON.parse(window.localStorage.getItem(EVENTS_KEY) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
const EVENT_LEGEND = [
  { kind: 'SUPERNOVA', label: 'Supernova · precisa de você agora' },
  { kind: 'NOVA', label: 'Nova · atenção' },
  { kind: 'AGN', label: 'AGN · campanha em andamento' },
  { kind: 'HII', label: 'Região H II · muitos testes novos' },
  { kind: 'REMNANT', label: 'Remanescente · resolvido' },
  { kind: 'FLARE', label: 'Flare · novidade' },
] as const;

const EVENT_INFO: Record<GalaxyEvent['kind'], { title: string; meaning: string; action: string }> = {
  SUPERNOVA: { title: 'Supernova', meaning: 'Item com human gate ou importância ≥ 0.9: a Tower está esperando uma decisão sua.', action: 'Resolva o gate ou delegue. Enquanto isso, o item não avança.' },
  NOVA: { title: 'Nova', meaning: 'Item que pede sua atenção, com urgência menor que uma supernova.', action: 'Revise quando puder. Não bloqueia o fluxo agora.' },
  AGN: { title: 'AGN · núcleo ativo', meaning: 'Campanha científica rodando no domínio: testes em RUNNING, IN_PROGRESS ou CHECKPOINTED.', action: 'Nada a fazer. Acompanhe os resultados à medida que saem.' },
  HII: { title: 'Região H II', meaning: 'Subdomínio com 3 ou mais testes novos em READY: área de formação de hipóteses.', action: 'Candidato a próxima campanha: priorize ou agrupe os testes.' },
  REMNANT: { title: 'Remanescente', meaning: 'Item concluído desde o último snapshot (DONE, VERIFIED, REJECTED…).', action: 'Confira se os efeitos e artefatos já foram absorvidos.' },
  FLARE: { title: 'Flare', meaning: 'Item adicionado desde o último snapshot.', action: 'Classifique e priorize se ainda não foi feito.' },
};
const RUNNING = new Set(['RUNNING', 'IN_PROGRESS', 'CHECKPOINTED', 'EXECUTING', 'CLAIMED']);

interface RawEntity {
  id: string; canonical_id?: string; kind?: string; title?: string; status?: string | null; cluster_id?: string;
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

// Overview only: clicking the galaxy never navigates away to the graphs.
export function GalaxyView({ selectedId }: { selectedId: string | null; onSelect?: (id: string) => void }) {
  const [entities, setEntities] = useState<RawEntity[] | null>(null);
  const [morphology, setMorphology] = useState<(GalaxyMorphology & { metrics?: Metrics; metrics_delta?: MetricsDelta | null }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [rawEvents, setRawEvents] = useState<GalaxyEvent[]>([]);
  const [hiddenEvents, setHiddenEvents] = useState<string[]>(readHiddenEvents);
  const toggleEvent = (kind: string) => setHiddenEvents(current => {
    const next = current.includes(kind) ? current.filter(k => k !== kind) : [...current, kind];
    try { window.localStorage.setItem(EVENTS_KEY, JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
    return next;
  });
  const [glow, setGlow] = useState<number>(readGlow);
  // Stable callbacks: they are scene deps, and a new identity rebuilds the whole
  // WebGL scene (and resets the camera) on every re-render.
  const handleSelect = useCallback((_id: string | null) => {}, []);
  const handleFailure = useCallback(() => setFailed(true), []);
  const handleEventSelect = useCallback((id: string) => setFocus(current => current?.id === id ? null : { id, nonce: Date.now() }), []);
  // Legend click cycles through the events of that kind, most intense first.
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const focusKind = (kind: string) => {
    const list = rawEvents.filter(e => e.kind === kind).sort((a, b) => b.intensity - a.intensity);
    if (!list.length) return;
    if (hiddenEvents.includes(kind)) toggleEvent(kind);
    const at = list.findIndex(e => e.id === focus?.id);
    setFocus({ id: list[(at + 1) % list.length]!.id, nonce: Date.now() });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(ENDPOINT, { signal: controller.signal, cache: 'no-cache' })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(snapshot => {
        setEntities(Array.isArray(snapshot?.entities) ? snapshot.entities : []);
        setMorphology(snapshot?.morphology && typeof snapshot.morphology === 'object' ? snapshot.morphology : null);
        setRawEvents(Array.isArray(snapshot?.events) ? snapshot.events : []);
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
  // Events share the nodes' world scale so they sit exactly on their domain.
  const events = useMemo(() => rawEvents.filter(event => !hiddenEvents.includes(event.kind)).map(event => ({ ...event, x: event.x * SCALE, y: event.y * SCALE, z: (event.z || 0) * SCALE })), [rawEvents, hiddenEvents]);
  const eventCounts = useMemo(() => rawEvents.reduce<Record<string, number>>((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {}), [rawEvents]);
  const metrics = morphology?.metrics;
  const focused = focus ? rawEvents.find(e => e.id === focus.id) ?? null : null;
  const related = useMemo(() => {
    if (!focused || !entities) return [];
    const list = entities ?? [];
    if (focused.kind === 'AGN') return list.filter(e => e.kind === 'TEST' && e.visual_domain === focused.domain && RUNNING.has(String(e.status || '').toUpperCase()));
    if (focused.kind === 'HII') { const sub = focused.id.replace(/^hii:/, ''); return list.filter(e => e.kind === 'TEST' && e.cluster_id === sub && String(e.status || '').toUpperCase() === 'READY'); }
    return list.filter(e => e.id === focused.entity || e.canonical_id === focused.entity);
  }, [focused, entities]);
  const delta = morphology?.metrics_delta ?? null;

  if (failed) return <div className="nexo-graph-fallback" role="status">Galáxia indisponível neste instante. Use 2D ou 3D.</div>;
  if (!entities) return <div className="nexo-graph-fallback" role="status">Compilando a galáxia…</div>;
  return (
    <div className="atlas3d-shell atlas-three-field-shell atlas-galaxy-view" data-renderer="galaxy-spiral">
      <GalaxyThree3D
        nodes={nodes}
        edges={[]}
        selectedId={selectedId}
        onSelect={handleSelect}
        onFailure={handleFailure}
        viewMode="detail"
        morphology={morphology}
        glow={glow}
        events={events}
        focusEvent={focus}
        onEventSelect={handleEventSelect}
      />
      {focused && (
        <aside className="galaxy-event-panel" data-kind={focused.kind} aria-label="Detalhes do evento">
          <header>
            <span className="ev-glyph"><EventGlyph kind={focused.kind} /></span>
            <div><small>{focused.domain || 'NEXO'}</small><h2>{EVENT_INFO[focused.kind].title}</h2></div>
            <button type="button" onClick={() => setFocus(null)} aria-label="Fechar">×</button>
          </header>
          <p className="ev-label">{focused.label}</p>
          {focused.reason && <p className="ev-reason"><b>Motivo</b>{focused.reason}</p>}
          <dl>
            <div><dt>O que é</dt><dd>{EVENT_INFO[focused.kind].meaning}</dd></div>
            <div><dt>O que fazer</dt><dd>{EVENT_INFO[focused.kind].action}</dd></div>
            <div><dt>Intensidade</dt><dd><meter min={0} max={1} value={focused.intensity} /> {Math.round(focused.intensity * 100)}%</dd></div>
          </dl>
          {related.length > 0 && (
            <section>
              <h3>{related.length === 1 ? 'Item' : `Itens (${related.length})`}</h3>
              <ul>
                {related.slice(0, 30).map(e => (
                  <li key={e.id}><span>{e.title || e.canonical_id || e.id}</span>{e.status && <small>{e.status}</small>}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}
      <div className="galaxy-hud">
        <div className="galaxy-glow" role="group" aria-label="Intensidade do brilho">
          <span>Brilho</span>
          {GLOW_LEVELS.map(level => (
            <button key={level.id} type="button" aria-pressed={glow === level.value} className={glow === level.value ? 'active' : ''} onClick={() => chooseGlow(level)}>
              {level.label}
            </button>
          ))}
        </div>
        {morphology?.stage_label && (
          <p className="galaxy-stage"><span>Estágio {morphology.stage}/5</span><strong>{morphology.stage_label}</strong></p>
        )}
        {rawEvents.length > 0 && (
          <ul className="galaxy-event-legend" aria-label="Eventos na galáxia">
            {EVENT_LEGEND.filter(item => eventCounts[item.kind]).map(item => {
              const on = !hiddenEvents.includes(item.kind);
              return (
                <li key={item.kind} data-kind={item.kind} className={on ? 'on' : 'off'}>
                  <button type="button" className="ev-go" onClick={() => focusKind(item.kind)} title="Ir até o evento">
                    <span className="ev-glyph"><EventGlyph kind={item.kind} /></span>{item.label} <b>{eventCounts[item.kind]}</b>
                  </button>
                  <button type="button" className="ev-eye" aria-pressed={on} onClick={() => { toggleEvent(item.kind); if (on && focus && rawEvents.find(e => e.id === focus.id)?.kind === item.kind) setFocus(null); }} title={on ? 'Ocultar' : 'Mostrar'}>
                    {on ? 'ver' : 'oculto'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
