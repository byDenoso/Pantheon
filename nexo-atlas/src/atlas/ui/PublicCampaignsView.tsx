import {useEffect, useState} from 'react';
import type {Locale} from '../api.ts';
import {campaignHref, campaignPage, type PublicCampaign, type PublicCampaignTest, type PublicReference} from '../canonicalPublicCampaigns.ts';
import {pick, type Bilingual} from '../publicItems.ts';
import CampaignTimeline from './CampaignTimeline.tsx';
import PublicVisualGallery from './PublicVisualGallery.tsx';
import type {PublicVisual} from '../publicVisuals.ts';
import {TOPICS,mentionedTopics,normalized} from '../researchExplorer.ts';

const labels = {
  'pt-BR': {title: 'Investigações por pergunta', ongoing: 'Em andamento', completed: 'Concluídas', search: 'Buscar pergunta', unknown: 'Ainda não publicado.', empty: 'Nenhuma investigação corresponde a esta busca.', missing: 'Esta investigação ainda não está disponível no catálogo público.', why: 'Por que investigar', method: 'Como investigamos', stage: 'Etapa atual', next: 'Próximo passo', limits: 'Limites', tests: 'Testes', result: 'Resultado revisado', closed: 'Encerramento', updated: 'Atualizado em', published: 'Catálogo atualizado em', previous: 'Anterior', following: 'Próxima', page: 'Página', of: 'de', open: 'Abrir investigação', all: 'Ver todas as investigações', references: 'Fontes públicas', technical: 'Detalhes técnicos', stages: {PLANNED: 'Teste planejado', RUNNING: 'Teste em execução', AWAITING_REVIEW: 'Aguardando revisão', REVIEWED: 'Revisão concluída', BLOCKED: 'Teste bloqueado', PAUSED: 'Teste pausado', UNKNOWN: 'Etapa ainda não publicada'}, outcomes: {SUPPORTS: 'Resultado favorável à hipótese', NULL: 'Resultado nulo', FALSIFIES: 'Hipótese refutada neste teste', INCONCLUSIVE: 'Resultado inconclusivo'}},
  en: {title: 'Investigations by question', ongoing: 'In progress', completed: 'Completed', search: 'Find a question', unknown: 'Not published yet.', empty: 'No investigation matches this search.', missing: 'This investigation is not available in the public catalog yet.', why: 'Why investigate', method: 'How we investigate', stage: 'Current stage', next: 'Next step', limits: 'Limitations', tests: 'Tests', result: 'Reviewed result', closed: 'Closure', updated: 'Updated on', published: 'Catalog updated on', previous: 'Previous', following: 'Next', page: 'Page', of: 'of', open: 'Open investigation', all: 'View all investigations', references: 'Public sources', technical: 'Technical details', stages: {PLANNED: 'Test planned', RUNNING: 'Test running', AWAITING_REVIEW: 'Awaiting review', REVIEWED: 'Review completed', BLOCKED: 'Test blocked', PAUSED: 'Test paused', UNKNOWN: 'Stage not published yet'}, outcomes: {SUPPORTS: 'Result supports the hypothesis', NULL: 'Null result', FALSIFIES: 'Hypothesis falsified by this test', INCONCLUSIVE: 'Inconclusive result'}},
};
const date = (value: string, locale: Locale) => new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(value));
const incomplete = {'pt-BR': 'As informações publicadas ainda estão incompletas.', en: 'The published information is not complete yet.'};
const pending = {'pt-BR': 'As investigações aguardam a publicação de uma atualização. Os resultados já publicados continuam disponíveis.', en: 'The investigations are awaiting publication of an update. Previously published results remain available.'};
function Sources({items, locale}: {items: PublicReference[]; locale: Locale}) {
  return items.length ? <div className="atlas-campaign-sources"><h4>{labels[locale].references}</h4><ul>{items.map((r, i) => <li key={i}><a href={r.url} rel="noopener noreferrer">{pick(r.label, locale)}</a></li>)}</ul></div> : null;
}
function Test({test, locale,visuals}: {test: PublicCampaignTest; locale: Locale;visuals:PublicVisual[]}) {
  const l = labels[locale];
  return <li className="atlas-campaign-test"><h4>{pick(test.question, locale)}</h4><p className="atlas-campaign-stage">{l.stages[test.stage]}</p>{test.method && <p>{pick(test.method, locale)}</p>}
    {test.result && <div className="atlas-campaign-result"><strong>{l.result}: {l.outcomes[test.result.verdict]}</strong><p>{pick(test.result.summary, locale)}</p>{test.result.limitations?.map((limit, i) => <p key={i}>{pick(limit, locale)}</p>)}</div>}
    {test.stage==='REVIEWED'&&test.result&&visuals.length>0&&<PublicVisualGallery visuals={visuals} locale={locale} compact/>}
    <small>{l.updated}: <time dateTime={test.updatedAt}>{date(test.updatedAt, locale)}</time></small><Sources items={test.references} locale={locale}/></li>;
}
function Campaign({campaign: c, locale,visuals=[]}: {campaign: PublicCampaign; locale: Locale;visuals?:PublicVisual[]}) {
  const l = labels[locale];
  const reviewedCount = c.tests.filter(test => test.stage === 'REVIEWED' && test.result !== null).length;
  const fields: [string, Bilingual | null][] = [[l.why, c.why], [l.method, c.method], [l.stage, c.currentStage], [l.next, c.nextStep]];
  return <article className="atlas-public-campaign" id={`campaign-${c.id}`} aria-labelledby={`question-${c.id}`}>
    <div className="atlas-campaign-heading"><span className="atlas-kind">{c.state === 'completed' ? l.completed : l.ongoing}</span><a href={campaignHref(c.id)} aria-label={`${l.open}: ${pick(c.question, locale)}`}>↗</a></div>
    <h3 id={`question-${c.id}`}><a href={campaignHref(c.id)}>{pick(c.question, locale)}</a></h3>
    <CampaignTimeline campaign={c} locale={locale}/>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ? pick(value, locale) : l.unknown}</dd></div>)}</dl>
    <div className="atlas-campaign-limits"><h4>{l.limits}</h4>{c.limitations === null ? <p>{l.unknown}</p> : c.limitations.length ? <ul>{c.limitations.map((limit, i) => <li key={i}>{pick(limit, locale)}</li>)}</ul> : <p>{l.unknown}</p>}</div>
    {c.closure && <div className="atlas-campaign-result"><h4>{l.closed}{c.closure.outcome ? `: ${l.outcomes[c.closure.outcome]}` : ''}</h4><p>{pick(c.closure.summary, locale)}</p><time dateTime={c.closure.closedAt}>{date(c.closure.closedAt, locale)}</time></div>}
    <details className="atlas-campaign-tests"><summary>{l.tests}{c.testsCoverage === 'COMPLETE' ? ` (${c.tests.length})` : ''}</summary>{c.testsCoverage !== 'COMPLETE' && <p>{incomplete[locale]}</p>}{c.tests.length > 0 ? <ol>{c.tests.map(test => <Test key={test.id} test={test} locale={locale} visuals={visuals.filter(v=>v.subject.kind==='campaign-test'&&v.subject.campaignId===c.id&&v.subject.testId===test.id)}/>)}</ol> : c.testsCoverage === 'COMPLETE' ? <p>{locale==='en'?'No tests published for this investigation yet.':'Ainda não há testes publicados nesta investigação.'}</p> : null}</details>
    {c.testsCoverage === 'COMPLETE' && c.tests.length > 0 && <div className="atlas-campaign-progress"><label>{locale === 'pt-BR' ? 'Testes com resultado revisado' : 'Tests with reviewed results'}: {reviewedCount}/{c.tests.length}<progress value={reviewedCount} max={c.tests.length}/></label></div>}
    <Sources items={c.references} locale={locale}/>
    <small>{l.updated}: <time dateTime={c.updatedAt}>{date(c.updatedAt, locale)}</time></small>
    <details><summary>{l.technical}</summary><p>{c.id} · {c.questionId}</p></details>
  </article>;
}
export default function PublicCampaignsView({campaigns, locale, generatedAt, coverage,visuals=[]}: {campaigns: PublicCampaign[]; locale: Locale; generatedAt?: string; coverage?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';visuals?:PublicVisual[]}) {
  const l = labels[locale];
  const requested = new URLSearchParams(window.location.search).get('campanha');
  const [state, setState] = useState<PublicCampaign['state']>('ongoing'), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [topic,setTopic]=useState(''),[testStage,setTestStage]=useState(''),[verdict,setVerdict]=useState(''),[method,setMethod]=useState('');
  const selected = campaigns.find(c => c.id === requested);
  useEffect(() => { if (selected) {setState(selected.state);const frame=requestAnimationFrame(()=>{const el=document.getElementById(`campaign-${selected.id}`);el?.setAttribute('tabindex','-1');el?.scrollIntoView({block:'start',behavior:'instant'});const heading=el?.querySelector<HTMLElement>('h3');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);} }, [selected?.id]);
  const matching=campaigns.filter(c=>(!topic||mentionedTopics([c.question['pt-BR'],c.method?.['pt-BR']??''].join(' ')).some(t=>t===topic))&&(!testStage||c.tests.some(t=>t.stage===testStage))&&(!verdict||c.tests.some(t=>t.stage==='REVIEWED'&&t.result?.verdict===verdict))&&(!method||normalized([c.method?.[locale]??'',...c.tests.map(t=>t.method?.[locale]??'')].join(' ')).includes(normalized(method.trim()))));
  const view = campaignPage(matching, {state, search, page, locale});
  return <section className="atlas-campaigns" aria-labelledby="h-campaigns">
    <h3 id="h-campaigns">{l.title}</h3>
    {generatedAt && <p className="atlas-campaign-publication">{l.published}: <time dateTime={generatedAt}>{date(generatedAt, locale)}</time></p>}
    {coverage !== 'COMPLETE' && <p className="atlas-campaign-coverage">{coverage === 'UNAVAILABLE' ? pending[locale] : incomplete[locale]}</p>}
    {requested ? <><a className="atlas-campaign-back" href="?#/">← {l.all}</a>{selected ? <Campaign campaign={selected} locale={locale} visuals={visuals}/> : <p>{l.missing}</p>}</> : <>
      <div className="atlas-campaign-controls"><div className="atlas-campaign-tabs" aria-label={l.title}>{(['ongoing', 'completed'] as const).map(s => <button key={s} type="button" aria-pressed={state === s} onClick={() => {setState(s); setPage(0);}}>{s === 'ongoing' ? l.ongoing : l.completed}{coverage !== 'UNAVAILABLE' && ` (${campaigns.filter(c => c.state === s).length})`}</button>)}</div><label htmlFor="campaign-search">{l.search}<input id="campaign-search" type="search" value={search} onChange={e => {setSearch(e.target.value); setPage(0);}}/></label></div>
      <div className="nexo-filter-row"><label>{locale==='en'?'Subject mentioned':'Assunto mencionado'}<select value={topic} onChange={e=>{setTopic(e.target.value);setPage(0);}}><option value="">{locale==='en'?'All':'Todos'}</option>{TOPICS.map(t=><option value={t.id} key={t.id}>{pick(t.label,locale)}</option>)}</select></label><label>{locale==='en'?'Investigations with tests at this stage':'Investigações com testes nesta etapa'}<select value={testStage} onChange={e=>{setTestStage(e.target.value);setPage(0);}}><option value="">{locale==='en'?'All stages':'Todas as etapas'}</option>{Object.entries(l.stages).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label>{locale==='en'?'Reviewed outcome':'Resultado revisado'}<select value={verdict} onChange={e=>{setVerdict(e.target.value);setPage(0);}}><option value="">{locale==='en'?'All outcomes':'Todos os resultados'}</option>{Object.entries(l.outcomes).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label>{locale==='en'?'Filter method':'Filtrar método'}<input type="search" value={method} onChange={e=>{setMethod(e.target.value);setPage(0);}}/></label></div>
      <div aria-live="polite">{view.items.length ? view.items.map(c => <Campaign key={c.id} campaign={c} locale={locale} visuals={visuals}/>) : <p className="atlas-empty">{coverage === 'UNAVAILABLE' ? l.unknown : l.empty}</p>}</div>
      {view.pages > 1 && <nav className="atlas-campaign-pagination" aria-label={l.page}><button type="button" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>{l.previous}</button><span>{l.page} {view.page + 1} {l.of} {view.pages}</span><button type="button" disabled={view.page + 1 >= view.pages} onClick={() => setPage(view.page + 1)}>{l.following}</button></nav>}
    </>}
  </section>;
}
