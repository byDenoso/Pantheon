import { useEffect, useState } from 'react';
import type { AtlasContext, DirectionalSignal, Freshness, PanelState, Provenance, ResearchRecord, ScientificStatus, TensionResult } from '../api/types';
import type { AtlasUiState, AtlasActions } from '../state/useAtlasSession';
import { useLabData, useObservatoryData, useObservatoryQuestions } from '../api/hooks';
import { routeFor } from '../atlas-route';
import { formatDate, formatEstimate, formatNumber, formatUncertainty } from '../science-format';
import { FreshnessBadge, ForestPlot, PanelFrame, PanelStateView, ParameterCard, ProvenanceDrawer, ReadOnlyNotice, ScientificStatusBadge, SkyMap, TensionComparison, RecordList } from '../components/atlas-ui';
import type { AtlasApiClient } from '../api/types';
import { DEFAULT_OBSERVATORY_SURFACES, type ObservatoryQuestionsRead, type ObservatorySurface } from '../api/observatory-questions';

type Navigate = (href: string) => void;

type PageProps = {
  api: AtlasApiClient;
  state: AtlasUiState;
  actions: AtlasActions;
  context: AtlasContext;
  reducedMotion: boolean;
  compact: boolean;
  navigate: Navigate;
  onProvenance: (title: string, items: Provenance[]) => void;
};

function domainFromFocus(focusId: string): string | undefined {
  return focusId.startsWith('domain:') ? focusId.slice('domain:'.length).toUpperCase() : undefined;
}

function pageContext(context: AtlasContext, state: AtlasUiState): AtlasContext {
  return { ...context, domain: context.domain || domainFromFocus(state.focusId) };
}

function sourceFreshness(state: AtlasUiState) {
  const raw = state.health?.dataSource?.freshness?.toUpperCase();
  const value: Freshness = raw === 'LIVE' || raw === 'SNAPSHOT' || raw === 'STALE' || raw === 'OFFLINE' ? raw : 'DEGRADED';
  return { state: value, source: state.health?.dataSource?.effective, sourceVersion: state.health?.sourceVersion };
}

function jumpToGraphs({ navigate, context, state }: Pick<PageProps, 'navigate' | 'context' | 'state'>) {
  navigate(routeFor('graphs', pageContext(context, state)));
}

// Renders a static summary instead of embedding the live 3D canvas here. The
// dedicated Mapa area (src/pages/graphs-page.tsx) already owns the safe, lazy-loaded,
// WebGL2-default rendering path (see graph-engine/GraphRenderer.tsx). Embedding a
// second, always-mounted AtlasCanvas instance in this compact preview was the source
// of a real, reproduced crash loop (a per-frame error inside three.js/TSL's node
// material path, thrown from a useFrame callback that a React error boundary cannot
// catch) -- fixed here by not mounting that component a second time, not by patching
// three.js internals blind.
function CompactGraph({ state, context, navigate }: Pick<PageProps, 'state' | 'actions' | 'reducedMotion' | 'compact' | 'context' | 'navigate'>) {
  return <div className="compact-graph-shell">
    <div className="compact-graph-stage compact-graph-static">{state.graph ? <div className="compact-graph-summary"><span aria-hidden="true">✧</span><p>{state.graph.nodes.length} nós · {state.graph.edges.length} relações no recorte atual</p></div> : <div className="graph-empty-state"><span aria-hidden="true">∅</span><p>{state.loading ? 'Lendo mapa de conhecimento…' : 'Mapa indisponível neste momento.'}</p><small>{state.error || 'Nenhum recorte válido foi publicado.'}</small></div>}{state.loading && <span className="compact-graph-status">LENDO MAPA…</span>}</div>
    <div className="compact-graph-footer"><span>{state.graph ? `${state.graph.nodes.length} nós · ${state.graph.edges.length} relações` : 'Recorte indisponível'}</span><button className="secondary-button" onClick={() => jumpToGraphs({ navigate, context, state })}>ABRIR NO MODO GRAFOS <span aria-hidden="true">→</span></button></div>
  </div>;
}

function observatorySurfaceHref(surface: ObservatorySurface, context: AtlasContext): string {
  if (surface.destination === 'universe') return routeFor('universe', context);
  if (surface.destination === 'lab') return routeFor('lab', { ...context, kind: surface.kind });
  return routeFor('graphs', context);
}

function surfaceMeta(surface: ObservatorySurface, questionRead?: ObservatoryQuestionsRead, relationCount?: number): string {
  if (surface.count !== undefined) return `${surface.count} publicados`;
  const questions = questionRead?.questions || [];
  if (surface.id === 'questions' && questions.length) return `${questions.length} publicados`;
  if (surface.id === 'tests' && questions.length) {
    const known = questions.filter(question => question.testCountKnown);
    if (known.length === questions.length) return `${known.reduce((sum, question) => sum + question.testCount, 0)} publicados`;
  }
  if (surface.id === 'relations' && relationCount !== undefined) return `${relationCount} publicados`;
  if (questionRead) return 'Não publicado';
  return 'Aguardando fonte';
}

function ObservatorySurfaceNav({ surfaces, questionRead, relationCount, context, navigate }: { surfaces: ObservatorySurface[]; questionRead?: ObservatoryQuestionsRead; relationCount?: number; context: AtlasContext; navigate: Navigate }) {
  return <section className="observatory-surface-nav" aria-label="Camadas semânticas do Observatório">
    <div className="observatory-surface-intro"><span className="eyebrow">CAMADAS DO OBSERVATÓRIO</span><b>Uma pergunta, cinco formas de investigar</b><p>Cada camada tem uma fonte e um destino próprios. O mapa espacial continua concentrado em domínios e campanhas.</p></div>
    <nav className="observatory-surface-tabs" aria-label="Superfícies de investigação">
      {surfaces.map((surface, index) => <a key={surface.id} className={`observatory-surface-tab ${index === 0 ? 'active' : ''}`} aria-current={index === 0 ? 'page' : undefined} href={observatorySurfaceHref(surface, context)} onClick={event => { event.preventDefault(); navigate(observatorySurfaceHref(surface, context)); }}>
        <span className="surface-tab-label">{surface.label}</span><small>{surface.description}</small><span className="surface-tab-meta">{surfaceMeta(surface, questionRead, relationCount)} <span aria-hidden="true">→</span></span>
      </a>)}
    </nav>
  </section>;
}

function ObservatoryContextPanel({ state, context, navigate }: Pick<PageProps, 'state' | 'context' | 'navigate'>) {
  const nodes = state.graph?.nodes.length ?? 0;
  const edges = state.graph?.edges.length ?? 0;
  return <div className="observatory-context-panel">
    <div className="observatory-context-copy"><span className="eyebrow">EXPLORAÇÃO ESPACIAL</span><h3>O Grafo é o mapa; o Observatório é a leitura.</h3><p>Use esta página para entender o estado publicado. Abra Grafos quando quiser navegar em profundidade entre sistemas, domínios e campanhas.</p></div>
    <div className="observatory-context-stats"><div><b>{nodes || '—'}</b><span>nós no recorte</span></div><div><b>{edges || '—'}</b><span>relações declaradas</span></div><div><b>{context.domain || 'GLOBAL'}</b><span>foco atual</span></div></div>
    <div className="observatory-context-note"><span aria-hidden="true">✧</span><span>Testes, resultados e evidências ficam nas camadas textuais. Eles não poluem a navegação 3D.</span></div>
    <button className="secondary-button" onClick={() => navigate(routeFor('graphs', context))}>ABRIR NO MODO GRAFOS <span aria-hidden="true">→</span></button>
  </div>;
}

function FilterBar({ area, context, navigate }: { area: 'observatory' | 'lab'; context: AtlasContext; navigate: Navigate }) {
  const set = (key: keyof AtlasContext, value: string) => navigate(routeFor(area, { ...context, [key]: value || undefined }));
  return <div className="filter-bar" aria-label="Filtros da projeção"><span className="filter-label">FILTROS</span><label>DOMÍNIO<select value={context.domain || ''} onChange={event => set('domain', event.target.value)}><option value="">Todos</option><option value="D1">D1</option><option value="D2">D2</option><option value="D3">D3</option><option value="D4">D4</option><option value="D5">D5</option><option value="D6">D6</option><option value="D7">D7</option><option value="D8">D8</option><option value="D9">D9</option><option value="D10">D10</option></select></label><label>PERÍODO<select value={context.period || ''} onChange={event => set('period', event.target.value)}><option value="">NOW</option><option value="24h">24H</option><option value="7d">7D</option><option value="30d">30D</option><option value="custom">CUSTOM</option></select></label><label>STATUS<select value={context.status || ''} onChange={event => set('status', event.target.value)}><option value="">Todos</option><option value="SUPPORTED">SUPPORTED</option><option value="PROVISIONAL">PROVISIONAL</option><option value="CANDIDATE">CANDIDATE</option><option value="INCONCLUSIVE">INCONCLUSIVE</option></select></label>{context.domain && <button className="filter-clear" onClick={() => navigate(routeFor(area, { ...context, domain: undefined }))}>Limpar contexto</button>}</div>;
}

function DirectionalEmpty({ navigate }: { navigate?: Navigate }) { return <div className="directional-empty"><span aria-hidden="true">◎</span><p>Sem sinal direcional robusto no estado atual.</p><small>A API não publicou evidência suficiente para sustentar uma direção preferencial.</small>{navigate && <button className="secondary-button panel-empty-action" onClick={() => navigate(routeFor('graphs'))}>Ver campanhas no Grafo →</button>}</div>; }

// Shared, honest empty-state action for the four panels below: none of them has a
// real data producer anywhere in this system today (confirmed by reading every
// static/live source -- not assumed), so rather than a bare "no data" message,
// each explains why and points at the one thing that IS real and visible right
// now: the per-domain campaigns in Grafos.
function SynthesisUnavailableAction({ navigate }: { navigate?: Navigate }) {
  if (!navigate) return null;
  return <button className="secondary-button panel-empty-action" onClick={() => navigate(routeFor('graphs'))}>Ver campanhas no Grafo →</button>;
}
const SYNTHESIS_UNAVAILABLE_REASON = 'Este painel depende de uma síntese quantitativa que a fonte ainda não publica neste snapshot.';

export function WeightedH0Panel({ state, onProvenance, onOpen, navigate }: { state: ReturnType<typeof useObservatoryData>; onProvenance: (title: string, items: Provenance[]) => void; onOpen: () => void; navigate?: Navigate }) {
  const data = state.data?.h0;
  const panelState: PanelState = state.state === 'LOADING' ? 'LOADING' : state.state === 'API_ERROR' ? 'API_ERROR' : data ? state.state === 'STALE' ? 'STALE' : 'READY' : 'EMPTY';
  return <PanelFrame id="weighted-h0-panel" icon="◒" title="H0 ponderado" subtitle="Estimativa combinada das medições publicadas" freshness={state.data?.freshness} action={<button className="info-button" onClick={onOpen} aria-label="Abrir detalhes do H0 ponderado">ⓘ</button>}><PanelStateView state={panelState} empty="Nenhuma estimativa consolidada disponível." reason={SYNTHESIS_UNAVAILABLE_REASON} action={<SynthesisUnavailableAction navigate={navigate}/>}>{data && <><div className="hero-estimate"><div><span className="eyebrow">ESTIMATIVA PUBLICADA</span><strong>H<sub>0</sub> = {formatEstimate(data.value, data.uncertainty)}</strong><span>{data.unit || 'Unidade não publicada'}</span></div><div className="estimate-meta">{data.datasetCount !== undefined && <span><b>{formatNumber(data.datasetCount, 0)}</b><small>datasets</small></span>}{data.chiSquared !== undefined && <span><b>χ² {formatNumber(data.chiSquared, 2)}</b><small>ajuste</small></span>}</div></div><ForestPlot estimate={data}/><div className="panel-footnote"><span>Intervalo 1σ: {data.interval1Sigma ? `[${formatNumber(data.interval1Sigma[0])}, ${formatNumber(data.interval1Sigma[1])}]` : 'não publicado'}</span><span>2σ: {data.interval2Sigma ? `[${formatNumber(data.interval2Sigma[0])}, ${formatNumber(data.interval2Sigma[1])}]` : 'não publicado'}</span><button className="source-link" onClick={() => onProvenance('Proveniência · H0 ponderado', data.provenance)}>ⓘ Fonte</button></div></>}</PanelStateView></PanelFrame>;
}

export function HubbleTensionPanel({ state, onProvenance, onOpen, navigate }: { state: ReturnType<typeof useObservatoryData>; onProvenance: (title: string, items: Provenance[]) => void; onOpen: (result: TensionResult) => void; navigate?: Navigate }) {
  const result = state.data?.tensions[0];
  const panelState: PanelState = state.state === 'LOADING' ? 'LOADING' : state.state === 'API_ERROR' ? 'API_ERROR' : result ? state.state === 'STALE' ? 'STALE' : 'READY' : 'EMPTY';
  return <PanelFrame id="hubble-tension-panel" icon="⚖" title="Tensão H0" subtitle="Comparação entre grupos classificados pela fonte" freshness={state.data?.freshness} action={<button className="info-button" onClick={() => result && onOpen(result)} aria-label="Abrir detalhes da tensão H0">ⓘ</button>}><PanelStateView state={panelState} empty="Nenhuma comparação de tensão publicada." reason={SYNTHESIS_UNAVAILABLE_REASON} action={<SynthesisUnavailableAction navigate={navigate}/>}>{result && <><TensionComparison result={result}/><div className="panel-status-line"><ScientificStatusBadge status={result.status}/><button className="source-link" onClick={() => onProvenance('Proveniência · tensão H0', result.provenance)}>ⓘ Fonte</button></div></>}</PanelStateView></PanelFrame>;
}

export function DirectionalSignalPanel({ state, onProvenance, onOpen, navigate }: { state: ReturnType<typeof useObservatoryData>; onProvenance: (title: string, items: Provenance[]) => void; onOpen: (signal: DirectionalSignal) => void; navigate?: Navigate }) {
  const signal = state.data?.directionalSignals[0];
  return <PanelFrame id="directional-signal-panel" icon="⌁" title="Direção aparente" subtitle="Sinais direcionais publicados para a expansão cósmica" freshness={state.data?.freshness} action={<button className="info-button" onClick={() => signal && onOpen(signal)} aria-label="Abrir detalhes do sinal direcional">ⓘ</button>}>
    {state.state === 'LOADING' ? <PanelStateView state="LOADING" empty=""/> : state.state === 'API_ERROR' ? <PanelStateView state="API_ERROR" empty=""/> : !signal ? <DirectionalEmpty navigate={navigate}/> : <div className="directional-content"><SkyMap signal={signal}/><div className="directional-facts"><div className="directional-title"><b>{signal.label}</b><ScientificStatusBadge status={signal.state}/></div>{signal.ra !== undefined && <p><span>RA</span><strong>{formatNumber(signal.ra, 2)}°</strong></p>}{signal.dec !== undefined && <p><span>Dec</span><strong>{formatNumber(signal.dec, 2)}°</strong></p>}{signal.amplitude !== undefined && <p><span>Amplitude</span><strong>{formatNumber(signal.amplitude, 3)} {formatUncertainty(signal.uncertainty)}</strong></p>}{signal.significance !== undefined && <p><span>Significância local</span><strong>{formatNumber(signal.significance, 2)} σ</strong></p>}{signal.globalSignificance !== undefined && <p><span>Global</span><strong>{formatNumber(signal.globalSignificance, 2)} σ</strong></p>}<small>{signal.method || 'Método não publicado'}{signal.redshiftRange ? ` · z ${signal.redshiftRange}` : ''}</small><button className="source-link" onClick={() => onProvenance('Proveniência · sinal direcional', signal.provenance)}>ⓘ Fonte</button></div></div>}
  </PanelFrame>;
}

export function UniverseSnapshotPanel({ state, onProvenance, onOpen, navigate }: { state: ReturnType<typeof useObservatoryData>; onProvenance: (title: string, items: Provenance[]) => void; onOpen: (parameterId: string) => void; navigate?: Navigate }) {
  const data = state.data;
  const panelState: PanelState = state.state === 'LOADING' ? 'LOADING' : state.state === 'API_ERROR' ? 'API_ERROR' : data?.parameters.length || data?.narrative ? state.state === 'STALE' ? 'STALE' : 'READY' : 'EMPTY';
  return <PanelFrame id="universe-snapshot-panel" icon="▤" title="Resumo do quadro atual" subtitle="O que a API sustenta e o que permanece aberto" freshness={data?.freshness}><PanelStateView state={panelState} empty="Nenhum resumo científico publicado." reason={SYNTHESIS_UNAVAILABLE_REASON} action={<SynthesisUnavailableAction navigate={navigate}/>}>{data && <><div className="snapshot-list">{data.parameters.slice(0, 8).map(parameter => <ParameterCard key={parameter.id} parameter={parameter} onOpen={() => onOpen(parameter.id)} onProvenance={() => onProvenance(`Proveniência · ${parameter.label}`, parameter.provenance)}/>)}</div>{data.narrative && <blockquote>“{data.narrative}”</blockquote>}</>}</PanelStateView></PanelFrame>;
}

export function ObservatoryPage({ api, state, actions, context, reducedMotion, compact, navigate, onProvenance }: PageProps) {
  const data = useObservatoryData(api, context);
  const questionRead = useObservatoryQuestions(api);
  const surfaces = questionRead.data?.surfaces || DEFAULT_OBSERVATORY_SURFACES;
  const [detail, setDetail] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState('Detalhes da observação');
  useEffect(() => { if (context.domain && state.focusId !== `domain:${context.domain}`) void actions.open({ id: `domain:${context.domain}`, type: 'DOMAIN', label: context.domain }); }, [actions, context.domain, state.focusId]);
  const openDetail = (title: string) => { setDetailTitle(title); setDetail(title); };
  return <div className="page-wrap observatory-page"><div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / OBSERVATÓRIO</span><h1>Observatório</h1><p>Monitoramento, medições e tensões cosmológicas a partir do grafo publicado.</p></div><div className="page-heading-meta">{state.health && <FreshnessBadge freshness={sourceFreshness(state)}/>}<span className="micro">Contexto: {context.domain || 'global'}</span></div></div><ObservatorySurfaceNav surfaces={surfaces} questionRead={questionRead.data || undefined} relationCount={state.graph?.edges.length} context={context} navigate={navigate}/><FilterBar area="observatory" context={context} navigate={navigate}/><div className="observatory-grid"><PanelFrame id="knowledge-map-panel" icon="✧" title="Contexto espacial" subtitle="O grafo mostra somente sistemas, domínios e campanhas" className="knowledge-map-panel"><ObservatoryContextPanel state={state} context={context} navigate={navigate}/></PanelFrame><WeightedH0Panel state={data} onProvenance={onProvenance} onOpen={() => openDetail('H0 ponderado · visão detalhada')} navigate={navigate}/><HubbleTensionPanel state={data} onProvenance={onProvenance} onOpen={result => openDetail(`Tensão H0 · ${result.label}`)} navigate={navigate}/><DirectionalSignalPanel state={data} onProvenance={onProvenance} onOpen={signal => openDetail(`Sinal direcional · ${signal.label}`)} navigate={navigate}/><UniverseSnapshotPanel state={data} onProvenance={onProvenance} onOpen={parameterId => openDetail(`Parâmetro · ${parameterId}`)} navigate={navigate}/></div>{detail && <DetailDialog title={detailTitle} onClose={() => setDetail(null)}><p>Esta visão detalhada aguarda o contrato específico de posterior, residuals e histórico na API.</p><small>O painel principal permanece fiel ao último payload validado; nenhuma análise adicional é inferida no cliente.</small></DetailDialog>}</div>;
}

function stageCount(records: ResearchRecord[]): number { return records.length; }

function LabStage({ label, count, records, onOpen }: { label: string; count: number; records: ResearchRecord[]; onOpen: (record: ResearchRecord) => void }) { return <div className="lab-stage"><span className="stage-index">{count ? '●' : '○'}</span><div><b>{label}</b><small>{count ? `${count} registros publicados` : 'Sem registros publicados'}</small></div><RecordList records={records} empty="Nenhum registro neste estágio." onOpen={onOpen}/></div>; }

export function LaboratoryPage({ api, state, actions, context, reducedMotion, compact, navigate, onProvenance }: PageProps) {
  const data = useLabData(api, context);
  const openRecord = (record: ResearchRecord) => actions.select(record.node);
  // Deep-linked here from a search result (kind=TEST|CLAIM|DATASET|ARTIFACT&entity=id)
  // per the locked map contract: those kinds never become graph nodes, they land here
  // as text instead. Auto-select the target entity once its data is available, same as
  // clicking its row manually would.
  useEffect(() => {
    if (!context.entity || !data.data) return;
    const all = [...data.data.claims, ...data.data.tests, ...data.data.runs, ...data.data.results, ...data.data.evidence, ...data.data.pipelines];
    const match = all.find(record => record.id === context.entity);
    if (match) openRecord(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.entity, data.data]);
  return <div className="page-wrap laboratory-page"><div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / LABORATÓRIO</span><h1>Laboratório</h1><p>O pipeline de investigação projetado sobre claims, testes, runs e evidências publicados.</p></div><span className="read-only-chip">READ-ONLY</span></div>{context.kind && <div className="lab-deep-link-banner" role="status">Filtrado a partir da busca · tipo <b>{context.kind}</b>{context.entity ? <> · <code>{context.entity}</code></> : null}</div>}<FilterBar area="lab" context={context} navigate={navigate}/><ReadOnlyNotice/><div className="lab-layout"><PanelFrame id="lab-knowledge-map" icon="✧" title="Mapa contextual" subtitle="Selecione D3 ou outro domínio para filtrar o trabalho" className="lab-map-panel"><CompactGraph state={state} actions={actions} reducedMotion={reducedMotion} compact={compact} context={context} navigate={navigate}/></PanelFrame><section className="lab-main"><div className="pipeline-strip" aria-label="Pipeline científico"><span>HYPOTHESIS</span><i>→</i><span>CLAIM</span><i>→</i><span>TEST</span><i>→</i><span>RUN</span><i>→</i><span>RESULT</span><i>→</i><span>EVIDENCE</span><i>→</i><span>DECISION / KNOWLEDGE</span></div><PanelFrame id="lab-stages" icon="◇" title="Trabalho registrado" subtitle={context.domain ? `Recorte ${context.domain}` : 'Todos os domínios'} freshness={data.freshness}><PanelStateView state={data.state} empty="Nenhum teste ativo neste domínio.">{data.data && <div className="lab-stages"><LabStage label="Hipóteses / claims" count={stageCount(data.data.claims)} records={data.data.claims} onOpen={openRecord}/><LabStage label="Testes" count={stageCount(data.data.tests)} records={data.data.tests} onOpen={openRecord}/><LabStage label="Runs / execuções" count={stageCount(data.data.runs)} records={data.data.runs} onOpen={openRecord}/><LabStage label="Resultados" count={stageCount(data.data.results)} records={data.data.results} onOpen={openRecord}/><LabStage label="Evidências" count={stageCount(data.data.evidence)} records={data.data.evidence} onOpen={openRecord}/><LabStage label="Pipelines" count={stageCount(data.data.pipelines)} records={data.data.pipelines} onOpen={openRecord}/></div>}</PanelStateView></PanelFrame><PanelFrame icon="◌" title="Execuções recentes" subtitle="Somente registros devolvidos pelo backend"><RecordList records={data.data?.runs || []} empty="Nenhuma execução recente publicada." onOpen={openRecord}/></PanelFrame></section></div></div>;
}

export function UniversePage({ api, state, context, navigate, onProvenance }: PageProps) {
  const data = useObservatoryData(api, context);
  const questions = useObservatoryQuestions(api);
  const questionRows = questions.data?.questions || [];
  const parameters = data.data?.parameters || [];
  const tensions = data.data?.tensions || [];
  const openQuestions = tensions.filter(item => ['TENSION', 'SIGNIFICANT', 'INCONCLUSIVE', 'INTERESTING'].includes(item.status));
  return <div className="page-wrap universe-page"><div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / SÍNTESE</span><h1>Resumo do Universo</h1><p>Estado científico atual do NEXO, organizado por perguntas e mantido com provenance.</p></div>{data.data && <FreshnessBadge freshness={data.data.freshness}/>}</div><div className="universe-hero"><div><span className="eyebrow">QUADRO ATUAL</span><h2>O que o NEXO atualmente sustenta</h2>{data.data?.narrative ? <p className="universe-narrative">{data.data.narrative}</p> : <p className="muted-copy">Sem síntese publicada para o estado atual. Os parâmetros abaixo aparecem somente quando fornecidos pela API.</p>}</div><div className="universe-hero-stamp"><span>STATUS</span><ScientificStatusBadge status={data.data?.parameters.length ? 'SUPPORTED' : 'INCONCLUSIVE'}/></div></div><PanelFrame id="universe-parameters" icon="◉" title="Parâmetros publicados" subtitle="A lista é aberta e vem do contrato de síntese" freshness={data.data?.freshness}><PanelStateView state={data.state} empty="Nenhum parâmetro publicado no snapshot atual."><div className="parameter-grid">{parameters.map(parameter => <ParameterCard key={parameter.id} parameter={parameter} onProvenance={() => onProvenance(`Proveniência · ${parameter.label}`, parameter.provenance)}/>)}</div></PanelStateView></PanelFrame><section className="universe-questions"><div className="section-heading"><div><span className="eyebrow">PERGUNTAS DO OBSERVATÓRIO</span><h2>Perguntas publicadas por domínio</h2></div><button className="secondary-button" onClick={() => navigate(routeFor('observatory', context))}>Abrir Observatório →</button></div><PanelStateView state={questions.state} empty="Nenhum domínio científico publicado neste snapshot."><div className="question-grid">{questionRows.map(question => <article className="question-card" key={question.id}><span className="question-index">{question.code}</span><h3>{question.label}</h3><p className="question-prompt">{question.question || 'Pergunta não publicada para este domínio.'}</p><ScientificStatusBadge status={question.status}/><div className="question-meta"><span>{question.campaigns.length} campanha{question.campaigns.length === 1 ? '' : 's'}</span>{question.testCountKnown ? <span>{question.testCount} testes publicados</span> : <span>testes não publicados</span>}</div><div className="question-campaigns">{question.campaigns.length ? question.campaigns.slice(0, 2).map(campaign => <span key={campaign.id} title={campaign.label}>{campaign.label}</span>) : <span>Nenhuma campanha vinculada publicada.</span>}</div><div className="question-synthesis"><span>SÍNTESE</span>{question.synthesis ? <p>{question.synthesis}</p> : <p className="question-unavailable">{question.unavailableReason || 'Síntese quantitativa não publicada.'}</p>}</div><button className="source-link" onClick={() => navigate(routeFor('graphs', { domain: question.code }))}>Ver campanhas no Grafo →</button></article>)}</div></PanelStateView></section><section className="universe-open"><div className="section-heading"><div><span className="eyebrow">PERGUNTAS EM ABERTO</span><h2>Tensões, candidatos e inconclusivos</h2></div></div>{openQuestions.length ? openQuestions.map(result => <button className="open-question" key={result.id} onClick={() => navigate(routeFor('observatory', { ...context, status: result.status }))}><span>{result.label}</span><ScientificStatusBadge status={result.status}/><span aria-hidden="true">→</span></button>) : <div className="empty-inline">Nenhuma tensão publicada no estado atual.</div>}</section><section className="universe-changes"><div className="section-heading"><div><span className="eyebrow">MUDANÇAS RECENTES</span><h2>Histórico que a fonte publicou</h2></div></div><div className="change-line"><span className="change-dot"/><div><b>{data.data?.freshness.updatedAt ? `Última atualização: ${formatDate(data.data.freshness.updatedAt)}` : 'Timestamp não publicado'}</b><p>O Atlas não transforma uma leitura pontual em série histórica.</p></div></div></section></div>;
}

function DetailDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="detail-dialog" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">DRILL-DOWN</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhe">×</button></header><div className="detail-dialog-body">{children}</div></section></div>; }

// A second, unused GraphsPage used to live here, statically importing AtlasCanvas.
// Confirmed zero consumers (only ObservatoryPage/LaboratoryPage/UniversePage are ever
// imported from this module -- grepped the whole repo, including tests) before
// removing it; the real, wired-in GraphsPage lives in src/pages/graphs-page.tsx and
// already renders through the safe, lazy-loaded GraphRenderer path.
