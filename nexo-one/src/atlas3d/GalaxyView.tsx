// Mapa · Galáxia. The shape is an indicator of NEXO's state: the server
// compiler derives arm mass/length/thickness/fragmentation, bridges and core
// from Tower semantics (galaxy-morphology.mjs) and publishes it with shape
// metrics in the snapshot. This view renders it and never reinterprets it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENT_TAG, EventGlyph, GalaxyThree3D, type GalaxyEvent, type GalaxyMorphology, type GalaxyWebFilament, type GalaxyWebGroup } from '../components/GalaxyThree3D.tsx';
import type { GraphNode, GraphNodeType } from '../contracts/system.ts';
import type { AtlasObservedEntity } from '../contracts/atlasObservation.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import { useNexoStore } from '../data/NexoStore.tsx';
import { domainLabel } from '../viewmodels/tokens.ts';

const SCALE = 0.36; // matches G_SCALE in GalaxyThree3D (half size)
const ENDPOINT = import.meta.env?.VITE_GALAXY_ENDPOINT?.trim() || './galaxy/latest.json';
const TYPE: Record<string, GraphNodeType> = {
  TEST: 'TEST', WORK: 'ACTION', CAPABILITY: 'CAPABILITY', HYPOTHESIS: 'CLAIM', RESULT: 'EFFECT',
};
const RADIUS: Partial<Record<GraphNodeType, number>> = { TEST: 1.4, ACTION: 1.2, CAPABILITY: 1.0 };
const GLOW_LEVELS = [
  // Dener 2026-09-25: the 0.15–0.28 presets read as a dull, broken render; back to a visible glow.
  { id: 'soft', label: 'Suave', value: 0.32 },
  { id: 'medium', label: 'Médio', value: 0.48 },
  { id: 'strong', label: 'Forte', value: 0.66 },
] as const;
const GLOW_KEY = 'nexo.galaxy.glow.v2'; // v2: old stored choice was tied to the dim presets
const EVENTS_KEY = 'nexo.galaxy.events-off.v1';

function readHiddenEvents(): string[] {
  try { const v = JSON.parse(window.localStorage.getItem(EVENTS_KEY) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
const EVENT_LEGEND = [
  { kind: 'SUPERNOVA', label: 'Decisão importante · Supernova' },
  { kind: 'NOVA', label: 'Atenção · Nova' },
  { kind: 'AGN', label: 'Pesquisa em curso · Núcleo ativo' },
  { kind: 'HII', label: 'Vários testes prontos · Região H II' },
  { kind: 'REMNANT', label: 'Atividade encerrada · Remanescente' },
  { kind: 'FLARE', label: 'Item adicionado · Flare' },
] as const;

const EVENT_INFO: Record<GalaxyEvent['kind'], { title: string; explanation: string; action: string; rule: string }> = {
  SUPERNOVA: { title: 'Supernova', explanation: 'Um assunto prioritário está parado à espera de uma decisão humana.', action: 'Revise a decisão pendente. As etapas que dependem dela só continuam depois disso.', rule: 'Marca itens com decisão humana pendente ou prioridade muito alta.' },
  NOVA: { title: 'Nova', explanation: 'Há uma atividade que merece revisão, mas ela não está bloqueando o restante do trabalho.', action: 'Leia o contexto e escolha quando agir; o restante do fluxo pode continuar.', rule: 'Marca itens que pedem atenção sem interromper o fluxo.' },
  AGN: { title: 'Núcleo ativo', explanation: 'O snapshot registra uma concentração de testes neste campo.', action: 'Consulte o estado de cada teste e sua evidência antes de concluir se há execução em curso.', rule: 'Agrupa itens conforme o tipo de evento publicado; o estado de execução aparece em cada item.' },
  HII: { title: 'Região de novos testes', explanation: 'Vários testes novos se concentram no mesmo assunto e podem formar uma linha de investigação.', action: 'Compare as perguntas e reúna os testes que ajudam a distinguir explicações concorrentes.', rule: 'Marca uma área com três ou mais testes prontos para começar.' },
  REMNANT: { title: 'Remanescente', explanation: 'O snapshot registra uma atividade em estado final.', action: 'Confira se o resultado e seus efeitos foram registrados na etapa seguinte.', rule: 'Agrupa itens com estado final no snapshot publicado.' },
  FLARE: { title: 'Nova atividade', explanation: 'O snapshot registra uma atividade para acompanhamento.', action: 'Leia a descrição e encaminhe o item para a próxima etapa adequada.', rule: 'Marca atividade incluída no snapshot publicado.' },
};
const RUNNING = new Set(['RUNNING', 'IN_PROGRESS', 'EXECUTING']);
const STATUS_COPY: Record<string, string> = {
  READY: 'Pronto para começar', RUNNING: 'Em execução', IN_PROGRESS: 'Em andamento',
  CHECKPOINTED: 'Aguardando a próxima etapa', EXECUTING: 'Em execução', CLAIMED: 'Assumido por uma automação',
  DONE: 'Concluído', VERIFIED: 'Verificado', REJECTED: 'Encerrado após revisão', FAILED: 'Falhou',
  BLOCKED: 'Bloqueado', PENDING: 'Aguardando', OPEN: 'Aberto', CLOSED: 'Encerrado',
};
const humanStatus = (value?: string | null) => value ? STATUS_COPY[value.toUpperCase()] ?? 'Estado em atualização' : '';
const isTechnicalLabel = (value?: string | null) => Boolean(value && (/^[A-Z0-9][A-Z0-9_.:-]{7,}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)));
const humanTitle = (entity: AtlasObservedEntity) => [entity.title, entity.plain, entity.meaning]
  .find(value => Boolean(value?.trim()) && !isTechnicalLabel(value) && value !== entity.id && value !== entity.canonical_id)
  || 'Item relacionado a este assunto';

type RawEntity = AtlasObservedEntity;

interface Metrics {
  center_of_mass: { x: number; y: number };
  asymmetry: number;
  domain_entropy_bits: number;
  radial_ratio: number;
  cross_link_density: number;
  entities_by_domain: Record<string, number>;
}
type MetricsDelta = Partial<Record<'asymmetry' | 'domain_entropy_bits' | 'radial_ratio' | 'cross_link_density', number | null>>;

function toNode(entity: RawEntity, stale: boolean): PlacedNode3D {
  const type = TYPE[String(entity.kind || '').toUpperCase()] ?? 'ACTION';
  const domain = (entity.visual_domain || entity.domain || 'NEXO') as GraphNode['domain'];
  const sourceRef = entity.source?.repository
    || entity.source?.collection
    || entity.source?.authority
    || 'TOWER_V06';
  const observation = entity.observation;
  return {
    id: entity.canonical_id || entity.id,
    type,
    label: entity.title || entity.canonical_id || entity.id,
    domain,
    // This is a published point-in-time projection, not a live execution signal.
    state: 'SNAPSHOT',
    authority_class: 'DERIVED',
    source_ref: sourceRef,
    source_revision: observation.source_revision,
    fingerprint: observation.projection_fingerprint,
    freshness: { state: stale ? 'STALE' : 'UNKNOWN', observed_at: observation.observed_at, ttl_seconds: null },
    checked_at: observation.observed_at,
    summary: entity.meaning || entity.plain || '',
    operational_status: entity.status || 'UNKNOWN',
    scientific_state: observation.scientific_state,
    attempt_state: observation.attempt_state,
    review_state: observation.review_state,
    decision_required: observation.decision_required,
    human_gate: observation.decision_required,
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
export function GalaxyView({ selectedId, onSelect }: { selectedId: string | null; onSelect?: (id: string) => void }) {
  const { system, atlasObservation, loadAtlasSnapshot } = useNexoStore();
  const projectionFingerprint = system.state?.bus.fingerprint ?? '';
  const snapshot = atlasObservation.snapshot;
  const entities = snapshot?.entities ?? null;
  const rawEvents = snapshot?.events ?? [];
  const morphology = (snapshot?.morphology as (GalaxyMorphology & { metrics?: Metrics; metrics_delta?: MetricsDelta | null }) | null | undefined) ?? null;
  const [rendererFailed, setRendererFailed] = useState(false);
  const [hiddenEvents, setHiddenEvents] = useState<string[]>(readHiddenEvents);
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const toggleEvent = (kind: string) => setHiddenEvents(current => {
    const next = current.includes(kind) ? current.filter(k => k !== kind) : [...current, kind];
    try { window.localStorage.setItem(EVENTS_KEY, JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
    return next;
  });
  const [glow, setGlow] = useState<number>(readGlow);
  // Stable callbacks avoid rebuilding the WebGL scene when parent callbacks change.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const handleSelect = useCallback((id: string | null) => {
    if (!id) return;
    setLocalSelectedId(id);
    onSelectRef.current?.(id);
  }, []);
  const handleFailure = useCallback(() => setRendererFailed(true), []);
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
    if (!projectionFingerprint) return;
    const controller = new AbortController();
    void loadAtlasSnapshot(ENDPOINT, projectionFingerprint, controller.signal);
    return () => controller.abort();
  }, [loadAtlasSnapshot, projectionFingerprint]);

  useEffect(() => {
    if (!snapshot || !focus) return;
    const eventIds = new Set(snapshot.events.map(event => event.id));
    if (!eventIds.has(focus.id)) setFocus(null);
  }, [focus, snapshot]);

  const chooseGlow = (level: (typeof GLOW_LEVELS)[number]) => {
    setGlow(level.value);
    try { window.localStorage.setItem(GLOW_KEY, level.id); } catch { /* per-viewer convenience only */ }
  };

  // The galaxy always shows every published entity: it reads best as the whole
  // system. Lenses (Operação, Ciência, Sistema, Aprendizado, Tudo) drive 2D/3D.
  const isStale = atlasObservation.status === 'STALE' || atlasObservation.status === 'PARTIAL' || atlasObservation.status === 'UNAVAILABLE'
    || Boolean(snapshot && atlasObservation.requested_fingerprint
      && atlasObservation.requested_fingerprint.toLowerCase() !== snapshot.provenance.source_fingerprint.toLowerCase());
  const nodes = useMemo(() => (entities ?? []).map(entity => toNode(entity, isStale)), [entities, isStale]);
  // Endpoints and membership come exclusively from the validated projection.
  // A CONTAINS curve is presentation hierarchy, never an inferred dependency.
  const publicWeb = useMemo(() => {
    const anchors = new Map<string, { x: number; y: number; z: number }>();
    const canonical = new Map<string, string>();
    const groups: GalaxyWebGroup[] = [];
    for (const entity of entities ?? []) {
      const point = { x: (entity.layout?.x ?? 0) * SCALE, y: (entity.layout?.y ?? 0) * SCALE, z: (entity.layout?.z ?? 0) * SCALE };
      anchors.set(entity.id, point);
      canonical.set(entity.id, entity.canonical_id || entity.id);
      if (entity.canonical_id) anchors.set(entity.canonical_id, point);
    }
    for (const collection of [snapshot?.domains, snapshot?.subdomains]) {
      if (!Array.isArray(collection)) continue;
      for (const raw of collection) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') continue;
        const layout = raw.layout;
        if (!layout || ![layout.x, layout.y, layout.z ?? 0].every(Number.isFinite)) continue;
        const point = { x: layout.x * SCALE, y: layout.y * SCALE, z: (layout.z ?? 0) * SCALE };
        anchors.set(raw.id, point);
        if (collection === snapshot?.subdomains) groups.push({ id: raw.id, ...point,
          count: (entities ?? []).filter(entity => entity.cluster_id === raw.id).length });
      }
    }
    const filaments: GalaxyWebFilament[] = [];
    for (const raw of snapshot?.relations ?? []) {
      if (!raw || typeof raw !== 'object') continue;
      const relation = raw as Record<string, unknown>;
      if (typeof relation.from !== 'string' || typeof relation.to !== 'string' || typeof relation.id !== 'string') continue;
      const from = anchors.get(relation.from);
      const to = anchors.get(relation.to);
      if (!from || !to) continue;
      filaments.push({ id: relation.id, kind: String(relation.kind || 'RELATION'), from, to,
        semantic: relation.semantic === true, derived: relation.derived === true,
        entityIds: [canonical.get(relation.from) || relation.from, canonical.get(relation.to) || relation.to] });
    }
    return { groups, filaments };
  }, [entities, snapshot]);
  // Tower gives each observation an entity id and may also publish a
  // canonical id shared with Atlas/SystemState. The scene selects by canonical
  // id, so accept either key when reconciling the controlled selection.
  const entityIds = useMemo(() => new Set((entities ?? []).flatMap(entity => [entity.id, entity.canonical_id].filter((id): id is string => Boolean(id)))), [entities]);
  const galaxySelectedId = selectedId && entityIds.has(selectedId)
    ? selectedId
    : localSelectedId && entityIds.has(localSelectedId) ? localSelectedId : null;
  // Events share the nodes' world scale so they sit exactly on their domain.
  const events = useMemo(() => rawEvents.filter(event => !hiddenEvents.includes(event.kind)).map(event => ({ ...event, entity: event.entity || undefined, x: event.x * SCALE, y: event.y * SCALE, z: (event.z || 0) * SCALE })), [rawEvents, hiddenEvents]);
  const eventCounts = useMemo(() => rawEvents.reduce<Record<string, number>>((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {}), [rawEvents]);
  const metrics = morphology?.metrics;
  const focused = focus ? rawEvents.find(e => e.id === focus.id) ?? null : null;
  const related = useMemo(() => {
    if (!focused || !entities) return [];
    const list = entities ?? [];
    if (focused.kind === 'AGN') return list.filter(e => e.kind === 'TEST'
      && e.visual_domain === focused.domain
      && RUNNING.has(e.observation.attempt_state.toUpperCase()));
    if (focused.kind === 'HII') { const sub = focused.id.replace(/^hii:/, ''); return list.filter(e => e.kind === 'TEST' && e.cluster_id === sub && String(e.status || '').toUpperCase() === 'READY'); }
    return list.filter(e => e.id === focused.entity || e.canonical_id === focused.entity);
  }, [focused, entities]);
  const delta = morphology?.metrics_delta ?? null;
  const primaryRelated = related[0] as RawEntity | undefined;
  const contextParts = useMemo(() => {
    if (!focused) return [];
    const raw = [
      domainLabel(focused.domain || 'NEXO'),
      primaryRelated?.subdomain,
      related.length === 1 ? primaryRelated?.title : null,
    ].filter((value): value is string => Boolean(value && String(value).trim()));
    return raw.filter((value, index) => !isTechnicalLabel(value) && raw.indexOf(value) === index);
  }, [focused, primaryRelated, related.length]);
  const visibleRelated = related.slice(0, 3);
  const moreRelated = related.slice(3, 30);

  if (!snapshot) return <div className="nexo-graph-fallback" role="status">
    {atlasObservation.status === 'UNAVAILABLE'
      ? 'A projeção pública da galáxia não pôde ser validada.'
      : projectionFingerprint ? 'Compilando a galáxia.' : 'Aguardando uma revisão validada da projeção.'}
  </div>;
  return (
    <div className="atlas3d-shell atlas-three-field-shell atlas-galaxy-view" data-renderer="galaxy-spiral" data-web-palette={publicWeb.filaments.length ? 'cold' : 'default'} data-observation-state={atlasObservation.status.toLowerCase()} data-projection-fingerprint={snapshot.provenance.source_fingerprint}>
      <GalaxyThree3D
        nodes={nodes}
        edges={[]}
        selectedId={galaxySelectedId}
        onSelect={handleSelect}
        onFailure={handleFailure}
        viewMode="detail"
        morphology={morphology}
        webFilaments={publicWeb.filaments}
        webGroups={publicWeb.groups}
        glow={glow}
        events={events}
        focusEvent={focus}
        onEventSelect={handleEventSelect}
      />
      <div className="galaxy-observation-status" role="status" aria-live="polite" data-state={atlasObservation.status.toLowerCase()}>
        <span>{atlasObservation.status === 'AVAILABLE' ? 'Snapshot público validado' : atlasObservation.status === 'LOADING' ? 'Revalidando projeção; último snapshot preservado' : 'Último snapshot validado preservado'}</span>
        <time dateTime={snapshot.generated_at}>Gerado {new Date(snapshot.generated_at).toLocaleString()}</time>
        {atlasObservation.error_code && <span>Leitura: {atlasObservation.error_code}</span>}
        {rendererFailed && <span>Renderização 3D indisponível; os dados observados continuam disponíveis.</span>}
      </div>
      {focused && (
        <aside className="galaxy-event-panel" data-kind={focused.kind} aria-label="Detalhes do evento">
          <header>
            <span className="ev-glyph"><EventGlyph kind={focused.kind} /></span>
            <div><small>{domainLabel(focused.domain)}</small><h2>{EVENT_INFO[focused.kind].title}</h2></div>
            <button type="button" onClick={() => setFocus(null)} aria-label="Fechar">×</button>
          </header>
          {contextParts.length > 0 && (
            <nav className="ev-context" aria-label="Contexto do evento">
              {contextParts.map((part, index) => <span key={part}>{index > 0 && <i aria-hidden="true">›</i>}{part}</span>)}
            </nav>
          )}
          <p className="ev-label">{EVENT_INFO[focused.kind].explanation}</p>
          {related.length === 1 && primaryRelated?.plain && <p className="ev-plain"><b>Pergunta</b>{primaryRelated.plain}</p>}
          {related.length === 1 && primaryRelated?.meaning && <p className="ev-plain"><b>Resultado</b>{primaryRelated.meaning}</p>}
          {related.length > 1 && <p className="ev-summary">{related.length} itens estão ligados a este assunto e aparecem na lista abaixo.</p>}
          <section className="ev-action"><b>O que fazer</b><p>{EVENT_INFO[focused.kind].action}</p></section>
          {related.length > 0 && (
            <section>
              <h3>{related.length === 1 ? 'Item' : `Itens principais (${Math.min(3, related.length)}/${related.length})`}</h3>
              <ul>
                {visibleRelated.map(e => (
                  <li key={e.id}><div><span>{humanTitle(e)}</span>{e.plain && <em>{e.plain}</em>}</div>{e.status && <small title="O código do estado fica nos detalhes técnicos">{humanStatus(e.status)}</small>}</li>
                ))}
              </ul>
              {moreRelated.length > 0 && (
                <details className="ev-more">
                  <summary>Ver mais {moreRelated.length} itens</summary>
                  <ul>
                    {moreRelated.map(e => (
                      <li key={e.id}>
                        <div><span>{humanTitle(e)}</span>{e.plain && <em>{e.plain}</em>}</div>
                        {e.status && <small>{humanStatus(e.status)}</small>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
          <details className="ev-technical">
            <summary>Detalhes técnicos</summary>
            <dl>
              <div><dt>Como este sinal é identificado</dt><dd>{EVENT_INFO[focused.kind].rule}</dd></div>
              {focused.reason && <div><dt>Motivo</dt><dd>{focused.reason}</dd></div>}
              <div><dt>Intensidade</dt><dd><meter min={0} max={1} value={focused.intensity} /> {Math.round(focused.intensity * 100)}%</dd></div>
            </dl>
          </details>
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
                  <button type="button" className="ev-go" onClick={() => focusKind(item.kind)} title="Ir até o evento" aria-label={`${item.label}: ${eventCounts[item.kind]} ${eventCounts[item.kind] === 1 ? 'item' : 'itens'}`}>
                    <span className="ev-glyph"><EventGlyph kind={item.kind} /></span><span className="ev-name">{item.label}</span><span className="ev-short">{EVENT_TAG[item.kind]}</span> <b>{eventCounts[item.kind]}</b>
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
          <section className="galaxy-metrics-card" aria-label="Como interpretar a forma da galáxia">
            <p>As galáxias mostram os grupos publicados; os filamentos mostram suas relações. Ligações de agrupamento não indicam dependência causal. Ela descreve a organização do sistema; não prova, por si só, avanço científico. Entre parênteses, aparece a variação desde a atualização anterior.</p>
            <dl className="galaxy-metrics">
              <div><dt>Diferença entre os lados</dt><dd>{metrics.asymmetry.toFixed(2)}{signed(delta?.asymmetry)}</dd></div>
              <div><dt>Diversidade de áreas</dt><dd>{metrics.domain_entropy_bits.toFixed(2)}{signed(delta?.domain_entropy_bits)}</dd></div>
              <div><dt>Distribuição do centro às bordas</dt><dd>{metrics.radial_ratio.toFixed(2)}{signed(delta?.radial_ratio)}</dd></div>
              <div><dt>Ligações entre áreas</dt><dd>{metrics.cross_link_density.toFixed(3)}{signed(delta?.cross_link_density, 3)}</dd></div>
              <div className="galaxy-mass">
                <dt>Itens por área</dt>
                <dd>{Object.entries(metrics.entities_by_domain).sort((a, b) => b[1] - a[1]).map(([domain, count]) => (
                  <span key={domain} data-domain={domain}>{domainLabel(domain)} {count}</span>
                ))}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
