// Mapa · Galáxia. The shape is an indicator of NEXO's state: the server
// compiler derives arm mass/length/thickness/fragmentation, bridges and core
// from Tower semantics (galaxy-morphology.mjs) and publishes it with shape
// metrics in the snapshot. This view renders it and never reinterprets it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EVENT_TAG, EventGlyph, GalaxyThree3D, type GalaxyEvent, type GalaxyMorphology } from '../components/GalaxyThree3D.tsx';
import type { GraphNode, GraphNodeType } from '../contracts/system.ts';
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
  { kind: 'FLARE', label: 'Atividade recente · Flare' },
] as const;

const EVENT_INFO: Record<GalaxyEvent['kind'], { title: string; explanation: string; action: string; rule: string }> = {
  SUPERNOVA: { title: 'Supernova', explanation: 'Um assunto prioritário está parado à espera de uma decisão humana.', action: 'Revise a decisão pendente. As etapas que dependem dela só continuam depois disso.', rule: 'Marca itens com decisão humana pendente ou prioridade muito alta.' },
  NOVA: { title: 'Nova', explanation: 'Há uma atividade que merece revisão, mas ela não está bloqueando o restante do trabalho.', action: 'Leia o contexto e escolha quando agir; o restante do fluxo pode continuar.', rule: 'Marca itens que pedem atenção sem interromper o fluxo.' },
  AGN: { title: 'Núcleo ativo', explanation: 'Uma pesquisa ou sequência de testes está em andamento neste campo.', action: 'Acompanhe os resultados; não é necessária uma ação imediata.', rule: 'Agrupa testes que estão sendo executados ou aguardam uma etapa de execução.' },
  HII: { title: 'Região de novos testes', explanation: 'Vários testes novos se concentram no mesmo assunto e podem formar uma linha de investigação.', action: 'Compare as perguntas e reúna os testes que ajudam a distinguir explicações concorrentes.', rule: 'Marca uma área com três ou mais testes prontos para começar.' },
  REMNANT: { title: 'Remanescente', explanation: 'Uma atividade chegou recentemente a um estado final e deixou um resultado para consultar.', action: 'Confira se o resultado e seus efeitos foram registrados na etapa seguinte.', rule: 'Agrupa itens que terminaram desde a última atualização da galáxia.' },
  FLARE: { title: 'Nova atividade', explanation: 'Um item novo apareceu desde a atualização anterior.', action: 'Leia a descrição e encaminhe o item para a próxima etapa adequada.', rule: 'Marca itens adicionados desde a última atualização da galáxia.' },
};
const RUNNING = new Set(['RUNNING', 'IN_PROGRESS', 'CHECKPOINTED', 'EXECUTING', 'CLAIMED']);
const STATUS_COPY: Record<string, string> = {
  READY: 'Pronto para começar', RUNNING: 'Em execução', IN_PROGRESS: 'Em andamento',
  CHECKPOINTED: 'Aguardando a próxima etapa', EXECUTING: 'Em execução', CLAIMED: 'Assumido por uma automação',
  DONE: 'Concluído', VERIFIED: 'Verificado', REJECTED: 'Encerrado após revisão', FAILED: 'Falhou',
  BLOCKED: 'Bloqueado', PENDING: 'Aguardando', OPEN: 'Aberto', CLOSED: 'Encerrado',
};
const humanStatus = (value?: string | null) => value ? STATUS_COPY[value.toUpperCase()] ?? 'Estado em atualização' : '';
const isTechnicalLabel = (value?: string | null) => Boolean(value && (/^[A-Z0-9][A-Z0-9_.:-]{7,}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)));
const humanTitle = (entity: RawEntity) => [entity.title, entity.plain, entity.meaning]
  .find(value => Boolean(value?.trim()) && !isTechnicalLabel(value) && value !== entity.id && value !== entity.canonical_id)
  || 'Item relacionado a este assunto';

interface RawEntity {
  id: string; canonical_id?: string; kind?: string; title?: string; status?: string | null; cluster_id?: string;
  visual_domain?: string; subdomain?: string | null; campaign_id?: string | null; test_group_id?: string | null;
  plain?: string | null; meaning?: string | null; layout?: { x?: number; y?: number; z?: number };
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
  const { system } = useNexoStore();
  const projectionFingerprint = system.state?.bus.fingerprint ?? '';
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
    const delays = [0, 800, 2400];

    const load = async () => {
      setFailed(false);
      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        const delay = delays[attempt] ?? 0;
        if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
        if (controller.signal.aborted) return;
        try {
          const url = new URL(ENDPOINT, window.location.href);
          if (projectionFingerprint) url.searchParams.set('projection', projectionFingerprint);
          url.searchParams.set('readback', String(Date.now()));
          const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
          if (!response.ok) throw new Error(String(response.status));
          const snapshot = await response.json();
          const snapshotFingerprint = String(snapshot?.provenance?.source_fingerprint || '');
          if (projectionFingerprint && snapshotFingerprint && snapshotFingerprint !== projectionFingerprint) {
            throw new Error('GALAXY_EDGE_NOT_CONVERGED');
          }
          setEntities(Array.isArray(snapshot?.entities) ? snapshot.entities : []);
          setMorphology(snapshot?.morphology && typeof snapshot.morphology === 'object' ? snapshot.morphology : null);
          setRawEvents(Array.isArray(snapshot?.events) ? snapshot.events : []);
          return;
        } catch (error) {
          if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return;
          if (attempt === delays.length - 1) setFailed(true);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [projectionFingerprint]);

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
            <p>A espiral resume como os itens e as relações se distribuem. Ela descreve a organização do sistema; não prova, por si só, avanço científico. Entre parênteses, aparece a variação desde a atualização anterior.</p>
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
