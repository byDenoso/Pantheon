import { useEffect, useMemo, useState } from 'react';
import type { AtlasApiClient, AtlasContext, Provenance, ScientificStatus } from '../api/types';
import type { AtlasUiState, AtlasActions } from '../state/useAtlasSession';
import { adaptObservatoryState, contextQuery } from '../api/adapters';
import { routeFor } from '../atlas-route';
import { formatDate } from '../science-format';
import { FreshnessBadge, PanelFrame, PanelStateView, ParameterCard, ScientificStatusBadge } from '../components/atlas-ui';

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

type UniverseSynthesis = {
  availability?: 'AVAILABLE' | 'ABSENT' | 'UNKNOWN' | 'UNAVAILABLE' | string;
  status?: string | null;
  summary?: string | null;
  conclusion?: string | null;
  interpretation?: string | null;
  reason?: string | null;
  provenance?: Provenance[];
};
type UniverseSection = { id?: string; label?: string; summary?: string | null; status?: string | null; provenance?: Provenance[] };
type UniverseContract = {
  contract?: string;
  freshness?: string;
  sourceVersion?: string;
  sourceModifiedAt?: string | null;
  generatedAt?: string | null;
  synthesis?: UniverseSynthesis;
  sections?: UniverseSection[];
  parameters?: unknown[];
  tensions?: unknown[];
  directionalSignals?: unknown[];
};

type ReadState = { state: 'LOADING' | 'READY' | 'ERROR'; raw: UniverseContract | null; error?: string };
const QUESTIONS = ['Expansão', 'Energia escura', 'Matéria escura', 'Estrutura', 'CMB', 'Universo primordial', 'Galáxias high-z', 'SMBH', 'Microfísica', 'Partículas'];
const SCIENTIFIC = new Set<ScientificStatus>(['MEASURED','SUPPORTED','PROVISIONAL','CANDIDATE','INCONCLUSIVE','CONTRADICTED','BLOCKED','STALE','CONSISTENT','INTERESTING','TENSION','SIGNIFICANT','UNKNOWN']);

function synthesisCopy(synthesis?: UniverseSynthesis) {
  if (synthesis?.summary) return synthesis.summary;
  const availability = String(synthesis?.availability || 'UNAVAILABLE').toUpperCase();
  if (availability === 'UNKNOWN') return 'A fonte autorizada não publicou estado suficiente para classificar a síntese.';
  if (availability === 'ABSENT') return 'Nenhuma síntese foi publicada para este recorte.';
  return 'Nenhuma síntese publicada está disponível na projeção autorizada atual.';
}
function availabilityLabel(value?: string) {
  const normalized = String(value || 'UNAVAILABLE').toUpperCase();
  if (normalized === 'AVAILABLE') return 'PUBLICADO';
  if (normalized === 'UNKNOWN') return 'DESCONHECIDO';
  if (normalized === 'ABSENT') return 'NÃO PUBLICADO';
  return 'INDISPONÍVEL';
}
function scientificStatus(value?: string | null): ScientificStatus | null {
  const normalized = String(value || '').toUpperCase() as ScientificStatus;
  return SCIENTIFIC.has(normalized) ? normalized : null;
}

export default function UniversePage({ api, state, context, navigate, onProvenance }: PageProps) {
  const [read, setRead] = useState<ReadState>({ state: 'LOADING', raw: null });
  useEffect(() => {
    let active = true;
    setRead(previous => ({ ...previous, state: 'LOADING', error: undefined }));
    void api.research('universe', contextQuery(context)).then(value => {
      if (!active) return;
      setRead({ state: 'READY', raw: (value || {}) as UniverseContract });
    }).catch(error => {
      if (!active) return;
      setRead({ state: 'ERROR', raw: null, error: String(error?.message || error) });
    });
    return () => { active = false; };
  }, [api, context]);

  const observatory = useMemo(() => read.raw ? adaptObservatoryState(read.raw) : null, [read.raw]);
  const synthesis = read.raw?.synthesis;
  const sections = read.raw?.sections || [];
  const sectionFor = (question: string) => sections.find(section => String(section.label || '').toLowerCase() === question.toLowerCase() || String(section.id || '').toLowerCase() === question.toLowerCase());
  const freshness = observatory?.freshness || { state: 'DEGRADED' as const };
  const lastUpdate = read.raw?.sourceModifiedAt || read.raw?.generatedAt || freshness.updatedAt;

  return <div className="page-wrap universe-page">
    <div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / SÍNTESE</span><h1>Resumo do Universo</h1><p>Estado científico publicado pelo contrato de síntese, com ausência e derivação preservadas.</p></div>{read.raw && <FreshnessBadge freshness={freshness}/>}</div>
    <div className="universe-hero"><div><span className="eyebrow">QUADRO ATUAL</span><h2>O que o NEXO atualmente sustenta</h2><p className={synthesis?.summary ? 'universe-narrative' : 'muted-copy'}>{synthesisCopy(synthesis)}</p>{synthesis?.reason && <small>Motivo contratual: {synthesis.reason}</small>}</div><div className="universe-hero-stamp"><span>DISPONIBILIDADE</span><b>{availabilityLabel(synthesis?.availability)}</b>{scientificStatus(synthesis?.status) && <ScientificStatusBadge status={scientificStatus(synthesis?.status)!}/>}</div></div>

    <PanelFrame id="universe-parameters" icon="◉" title="Parâmetros publicados" subtitle="Somente valores presentes no contrato de síntese" freshness={freshness}>
      <PanelStateView state={read.state === 'LOADING' ? 'LOADING' : read.state === 'ERROR' ? 'API_ERROR' : observatory?.parameters.length ? 'READY' : 'EMPTY'} empty="Nenhum parâmetro foi publicado no contrato atual.">
        <div className="parameter-grid">{observatory?.parameters.map(parameter => <ParameterCard key={parameter.id} parameter={parameter} onProvenance={() => onProvenance(`Proveniência · ${parameter.label}`, parameter.provenance)}/>)}</div>
      </PanelStateView>
    </PanelFrame>

    <section className="universe-questions"><div className="section-heading"><div><span className="eyebrow">PERGUNTAS DO OBSERVATÓRIO</span><h2>Narrativa científica navegável</h2></div><button className="secondary-button" onClick={() => navigate(routeFor('observatory', context))}>Abrir Observatório →</button></div><div className="question-grid">{QUESTIONS.map((question,index) => {
      const section = sectionFor(question), status = scientificStatus(section?.status);
      return <article className="question-card" key={question}><span className="question-index">{String(index + 1).padStart(2, '0')}</span><h3>{question}</h3><p>{section?.summary || 'Não publicado na projeção autorizada atual.'}</p>{status ? <ScientificStatusBadge status={status}/> : <span className="read-only-chip">NÃO PUBLICADO</span>}{section?.provenance?.length ? <button className="source-link" onClick={() => onProvenance(`Proveniência · ${question}`, section.provenance || [])}>ⓘ Fonte</button> : null}</article>;
    })}</div></section>

    <section className="universe-open"><div className="section-heading"><div><span className="eyebrow">PERGUNTAS EM ABERTO</span><h2>Tensões e candidatos publicados</h2></div></div>{observatory?.tensions.length ? observatory.tensions.map(result => <button className="open-question" key={result.id} onClick={() => navigate(routeFor('observatory', { ...context, status: result.status }))}><span>{result.label}</span><ScientificStatusBadge status={result.status}/><span aria-hidden="true">→</span></button>) : <div className="empty-inline">Nenhuma tensão foi publicada no contrato atual.</div>}</section>
    <section className="universe-changes"><div className="section-heading"><div><span className="eyebrow">MUDANÇAS RECENTES</span><h2>Histórico que a fonte publicou</h2></div></div><div className="change-line"><span className="change-dot"/><div><b>{lastUpdate ? `Última versão da fonte: ${formatDate(lastUpdate)}` : 'Timestamp não publicado'}</b><p>O Atlas não transforma uma leitura pontual em série histórica.</p></div></div></section>
    {read.error && <div className="empty-inline">Falha de leitura do contrato: {read.error}</div>}
  </div>;
}
