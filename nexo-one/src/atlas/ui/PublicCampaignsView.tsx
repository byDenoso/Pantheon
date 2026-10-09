import {useEffect, useState} from 'react';
import type {Locale} from '../api.ts';
import {campaignHref, campaignPage, type PublicCampaign, type PublicCampaignTest, type PublicReference} from '../publicCampaigns.ts';
import {pick, type Bilingual} from '../publicItems.ts';

const labels = {
  'pt-BR': {title: 'Campanhas por pergunta', ongoing: 'Em andamento', completed: 'Concluídas', search: 'Buscar pergunta', unknown: 'Ainda não publicado.', empty: 'Nenhuma campanha corresponde a esta busca.', missing: 'Esta campanha ainda não está disponível na projeção pública.', why: 'Por que investigar', method: 'Como investigamos', stage: 'Etapa atual', next: 'Próximo passo', limits: 'Limites', tests: 'Testes', result: 'Resultado revisado', closed: 'Encerramento', updated: 'Atualizado em', published: 'Projeção publicada em', previous: 'Anterior', following: 'Próxima', page: 'Página', of: 'de', open: 'Abrir campanha', all: 'Ver todas as campanhas', references: 'Fontes públicas', technical: 'Detalhes técnicos', stages: {PLANNED: 'Teste planejado', RUNNING: 'Teste em execução', AWAITING_REVIEW: 'Aguardando revisão', REVIEWED: 'Revisão concluída', BLOCKED: 'Teste bloqueado', PAUSED: 'Teste pausado', UNKNOWN: 'Etapa ainda não publicada'}, outcomes: {SUPPORTS: 'Resultado favorável à hipótese', NULL: 'Resultado nulo', FALSIFIES: 'Hipótese refutada neste teste', INCONCLUSIVE: 'Resultado inconclusivo'}},
  en: {title: 'Campaigns by question', ongoing: 'In progress', completed: 'Completed', search: 'Find a question', unknown: 'Not published yet.', empty: 'No campaign matches this search.', missing: 'This campaign is not available in the public projection yet.', why: 'Why investigate', method: 'How we investigate', stage: 'Current stage', next: 'Next step', limits: 'Limitations', tests: 'Tests', result: 'Reviewed result', closed: 'Closure', updated: 'Updated on', published: 'Projection published on', previous: 'Previous', following: 'Next', page: 'Page', of: 'of', open: 'Open campaign', all: 'View all campaigns', references: 'Public sources', technical: 'Technical details', stages: {PLANNED: 'Test planned', RUNNING: 'Test running', AWAITING_REVIEW: 'Awaiting review', REVIEWED: 'Review completed', BLOCKED: 'Test blocked', PAUSED: 'Test paused', UNKNOWN: 'Stage not published yet'}, outcomes: {SUPPORTS: 'Result supports the hypothesis', NULL: 'Null result', FALSIFIES: 'Hypothesis falsified by this test', INCONCLUSIVE: 'Inconclusive result'}},
};
const date = (value: string, locale: Locale) => new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(value));
const incomplete = {'pt-BR': 'A projeção pública ainda está incompleta.', en: 'The public projection is not complete yet.'};
function Sources({items, locale}: {items: PublicReference[]; locale: Locale}) {
  return items.length ? <div className="atlas-campaign-sources"><h4>{labels[locale].references}</h4><ul>{items.map((r, i) => <li key={i}><a href={r.url} rel="noopener noreferrer">{pick(r.label, locale)}</a></li>)}</ul></div> : null;
}
function Test({test, locale}: {test: PublicCampaignTest; locale: Locale}) {
  const l = labels[locale];
  return <li className="atlas-campaign-test"><h4>{pick(test.question, locale)}</h4><p className="atlas-campaign-stage">{l.stages[test.stage]}</p>{test.method && <p>{pick(test.method, locale)}</p>}
    {test.result && <div className="atlas-campaign-result"><strong>{l.result}: {l.outcomes[test.result.verdict]}</strong><p>{pick(test.result.summary, locale)}</p>{test.result.limitations?.map((limit, i) => <p key={i}>{pick(limit, locale)}</p>)}</div>}
    <small>{l.updated}: <time dateTime={test.updatedAt}>{date(test.updatedAt, locale)}</time></small><Sources items={test.references} locale={locale}/></li>;
}
function Campaign({campaign: c, locale}: {campaign: PublicCampaign; locale: Locale}) {
  const l = labels[locale];
  const fields: [string, Bilingual | null][] = [[l.why, c.why], [l.method, c.method], [l.stage, c.currentStage], [l.next, c.nextStep]];
  return <article className="atlas-public-campaign" id={`campaign-${c.id}`} aria-labelledby={`question-${c.id}`}>
    <div className="atlas-campaign-heading"><span className="atlas-kind">{c.state === 'completed' ? l.completed : l.ongoing}</span><a href={campaignHref(c.id)} aria-label={`${l.open}: ${pick(c.question, locale)}`}>↗</a></div>
    <h3 id={`question-${c.id}`}><a href={campaignHref(c.id)}>{pick(c.question, locale)}</a></h3>
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ? pick(value, locale) : l.unknown}</dd></div>)}</dl>
    <div className="atlas-campaign-limits"><h4>{l.limits}</h4>{c.limitations === null ? <p>{l.unknown}</p> : c.limitations.length ? <ul>{c.limitations.map((limit, i) => <li key={i}>{pick(limit, locale)}</li>)}</ul> : <p>{l.unknown}</p>}</div>
    {c.closure && <div className="atlas-campaign-result"><h4>{l.closed}{c.closure.outcome ? `: ${l.outcomes[c.closure.outcome]}` : ''}</h4><p>{pick(c.closure.summary, locale)}</p><time dateTime={c.closure.closedAt}>{date(c.closure.closedAt, locale)}</time></div>}
    <details className="atlas-campaign-tests"><summary>{l.tests}{c.testsCoverage === 'COMPLETE' ? ` (${c.tests.length})` : ''}</summary>{c.testsCoverage !== 'COMPLETE' && <p>{incomplete[locale]}</p>}<ol>{c.tests.map(test => <Test key={test.id} test={test} locale={locale}/>)}</ol></details>
    <Sources items={c.references} locale={locale}/>
    <small>{l.updated}: <time dateTime={c.updatedAt}>{date(c.updatedAt, locale)}</time></small>
    <details><summary>{l.technical}</summary><p>{c.id} · {c.questionId}</p></details>
  </article>;
}
export default function PublicCampaignsView({campaigns, locale, generatedAt, coverage}: {campaigns: PublicCampaign[]; locale: Locale; generatedAt?: string; coverage?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'}) {
  const l = labels[locale];
  const requested = new URLSearchParams(window.location.search).get('campanha');
  const [state, setState] = useState<PublicCampaign['state']>('ongoing'), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const selected = campaigns.find(c => c.id === requested);
  useEffect(() => { if (selected) setState(selected.state); }, [selected]);
  const view = campaignPage(campaigns, {state, search, page, locale});
  return <section className="atlas-campaigns" aria-labelledby="h-campaigns">
    <h3 id="h-campaigns">{l.title}</h3>
    {generatedAt && <p className="atlas-campaign-publication">{l.published}: <time dateTime={generatedAt}>{date(generatedAt, locale)}</time></p>}
    {coverage !== 'COMPLETE' && <p className="atlas-campaign-coverage">{incomplete[locale]}</p>}
    {requested ? <><a className="atlas-campaign-back" href="?#/">← {l.all}</a>{selected ? <Campaign campaign={selected} locale={locale}/> : <p>{l.missing}</p>}</> : <>
      <div className="atlas-campaign-controls"><div className="atlas-campaign-tabs" aria-label={l.title}>{(['ongoing', 'completed'] as const).map(s => <button key={s} type="button" aria-pressed={state === s} onClick={() => {setState(s); setPage(0);}}>{s === 'ongoing' ? l.ongoing : l.completed} ({campaigns.filter(c => c.state === s).length})</button>)}</div><label htmlFor="campaign-search">{l.search}<input id="campaign-search" type="search" value={search} onChange={e => {setSearch(e.target.value); setPage(0);}}/></label></div>
      <div aria-live="polite">{view.items.length ? view.items.map(c => <Campaign key={c.id} campaign={c} locale={locale}/>) : <p className="atlas-empty">{coverage === 'UNAVAILABLE' ? l.unknown : l.empty}</p>}</div>
      {view.pages > 1 && <nav className="atlas-campaign-pagination" aria-label={l.page}><button type="button" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>{l.previous}</button><span>{l.page} {view.page + 1} {l.of} {view.pages}</span><button type="button" disabled={view.page + 1 >= view.pages} onClick={() => setPage(view.page + 1)}>{l.following}</button></nav>}
    </>}
  </section>;
}
