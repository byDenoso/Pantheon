import {useMemo, useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
import type {TestEntity} from '../features/lab/model.ts';
import {hashForView} from '../app/navigation.ts';
import {labHref} from '../features/lab/routes.ts';
import {normDomain} from '../features/lab/domains.ts';
import {describeState, type Lang} from '../i18n/state-language.ts';
import {WORKSPACE_COPY, domainName} from './copy.ts';
import {canonicalTestRecord, displayValue, domainSummary, filterTests, operationRows, researchHref, testHref, type OperationGroup, type ResearchFilter} from './model.ts';

const PAGE_SIZE = 40;
export function SourceValue({value, lang, empty}: {value: unknown; lang: Lang; empty?: string}) {
  const m = WORKSPACE_COPY[lang], content = displayValue(value), limit = 16000;
  if (content === null) return <p className="pw-muted">{empty ?? m.unknown}</p>;
  return <><pre className="pw-value">{content.slice(0, limit)}</pre>{content.length > limit && <p className="pw-muted">{m.clipped}</p>}</>;
}
const StateText = ({value, lang}: {value: string | null; lang: Lang}) => <span className="pw-state">{describeState(value, lang).label}</span>;

export function DomainView({tests, state, lang}: {tests: readonly TestEntity[]; state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], domains = domainSummary(tests, state);
  return <main className="pw-page">
    <header className="pw-page-title"><p>{m.private}</p><h1 tabIndex={-1} data-private-heading>{m.domains}</h1><p>{m.domainsLead}</p></header>
    <div className="pw-domains">{domains.map(row => <a className="pw-domain" key={row.domain} href={researchHref(row.domain)}>
      <h2>{domainName(row.domain, lang)}<span aria-hidden="true">↗</span></h2>
      <dl><div><dt>{m.tests}</dt><dd>{row.tests}</dd></div><div><dt>{m.results}</dt><dd>{row.results}</dd></div><div><dt>{m.pending}</dt><dd>{row.pending}</dd></div></dl>
    </a>)}</div>
    {!domains.length && <p className="pw-empty">{m.domainsEmpty}</p>}
  </main>;
}

export function ResearchView({tests, state, domain, filter, lang}: {tests: readonly TestEntity[]; state: SystemState; domain: string | null; filter: ResearchFilter; lang: Lang}) {
  const m = WORKSPACE_COPY[lang];
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(PAGE_SIZE);
  const rows = useMemo(() => filterTests(tests, domain, filter, query), [tests, domain, filter, query]);
  const domains = domainSummary(tests, state);
  const chooseQuery = (value: string) => { setQuery(value); setLimit(PAGE_SIZE); };
  return <main className="pw-page">
    <header className="pw-page-title"><p><a href="#/teia/dominios">{m.domains}</a></p><h1 tabIndex={-1} data-private-heading>{domain === null ? m.tests : domainName(domain, lang)}</h1><p>{m.researchLead}</p></header>
    <div className="pw-research-tools">
      <label>{m.domains}<select value={domain ?? ''} onChange={event => { window.location.hash = researchHref(event.target.value || null, filter).slice(1); }}><option value="">{m.allDomains}</option>{domains.map(row => <option key={row.domain} value={row.domain}>{domainName(row.domain, lang)}</option>)}</select></label>
      <label className="pw-search">{m.search}<input type="search" value={query} placeholder={m.searchPlaceholder} onChange={event => chooseQuery(event.target.value)}/></label>
    </div>
    <nav className="pw-tabs" aria-label={m.tests}>{(['all','results','pending'] as const).map(key => <a key={key} href={researchHref(domain, key)} aria-current={filter === key ? 'page' : undefined}>{m[key]}<span>{filterTests(tests, domain, key).length}</span></a>)}</nav>
    <div className="pw-test-list" aria-live="polite">{rows.slice(0, limit).map(test => <article key={test.id} className="pw-test-row">
      <div><p className="pw-eyebrow">{domainName(normDomain(test.domain), lang)}{test.subdomain ? ` / ${test.subdomain}` : ''}</p><h2><a href={testHref(test.id)}>{test.name}</a></h2>{test.question && test.question !== test.name && <p>{test.question}</p>}</div>
      <div className="pw-row-state"><span>{m.progress}</span><StateText value={test.status} lang={lang}/><span>{m.review}</span><StateText value={test.review} lang={lang}/></div>
      <a className="pw-open" href={testHref(test.id)}>{m.openTest}<span aria-hidden="true">→</span></a>
    </article>)}</div>
    {!rows.length && <p className="pw-empty" role="status">{m.none}</p>}
    {rows.length > limit && <button type="button" className="pw-button" onClick={() => setLimit(value => value + PAGE_SIZE)}>{m.more} ({Math.min(PAGE_SIZE, rows.length - limit)})</button>}
  </main>;
}

export function TestDetail({test, state, lang}: {test: TestEntity; state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], raw = canonicalTestRecord(state, test.id);
  const recipe = raw?.recipe ?? raw?.recipe_spec ?? raw?.recipe_contract;
  const recipeRef = raw?.recipe_ref ?? raw?.recipe_id;
  const execution = raw?.execution ?? test.execution;
  const result = test.meaning ?? displayValue(test.result);
  return <main className="pw-page pw-test-detail">
    <header className="pw-page-title"><p><a href={researchHref(normDomain(test.domain))}>{domainName(normDomain(test.domain), lang)}</a> / {m.tests}</p><h1 tabIndex={-1} data-private-heading>{test.name}</h1><a className="pw-back" href={researchHref(normDomain(test.domain))}>← {m.back}</a></header>
    <section className="pw-summary" aria-label={m.question}><h2>{m.question}</h2><p className="pw-question">{test.question ?? m.unknown}</p><div className="pw-state-pair"><div><span>{m.progress}</span><StateText value={test.status} lang={lang}/></div><div><span>{m.review}</span><StateText value={test.review} lang={lang}/></div></div></section>
    <section className="pw-summary"><h2>{m.result}</h2><SourceValue value={result} lang={lang} empty={m.noResult}/>{test.verdictRaw && <p className="pw-muted">{describeState(test.verdictRaw, lang).label}</p>}
      {(displayValue(test.limitations) || displayValue(test.claimBoundary)) && <div className="pw-limits"><h3>{m.limits}</h3><SourceValue value={test.limitations} lang={lang}/>{displayValue(test.claimBoundary) && <SourceValue value={test.claimBoundary} lang={lang}/>}</div>}
    </section>
    <div className="pw-detail-sections">
      <details open><summary>{m.data}</summary><div><h3>{m.datasets}</h3><SourceValue value={raw?.datasets ?? test.datasets} lang={lang}/><h3>{m.artifacts}</h3><SourceValue value={raw?.artifacts ?? test.artifacts} lang={lang}/></div></details>
      <details><summary>{m.recipe}</summary><div><h3>{m.rawRecipe}</h3><SourceValue value={recipe} lang={lang} empty={m.unavailableRecipe}/>{recipeRef != null && <><h3>{m.recipeRef}</h3><SourceValue value={recipeRef} lang={lang}/></>}<h3>{m.method}</h3><SourceValue value={test.method ?? raw?.method} lang={lang}/><h3>{m.prereg}</h3><SourceValue value={raw?.prereg ?? test.prereg} lang={lang}/></div></details>
      <details><summary>{m.execution}</summary><div><h3>{m.status}</h3><p>{describeState(test.status, lang).label}</p><h3>{m.run}</h3><SourceValue value={execution} lang={lang}/><h3>{m.result}</h3><SourceValue value={raw?.result ?? test.result} lang={lang}/><h3>{m.statistics}</h3><SourceValue value={raw?.statistics ?? test.statistics} lang={lang}/></div></details>
      <details><summary>{m.review}</summary><div><p>{describeState(test.review, lang).label}</p><h3>{m.reviewHistory}</h3><SourceValue value={raw?.review ?? raw?.reviews ?? test.reviews} lang={lang}/><h3>{m.robustness}</h3><SourceValue value={test.robustness} lang={lang}/><h3>{m.limits}</h3><SourceValue value={test.limitations} lang={lang}/></div></details>
    </div>
    <details className="pw-technical"><summary>{m.technical}</summary><dl><dt>{m.id}</dt><dd>{test.id}</dd><dt>{m.status}</dt><dd>{test.status ?? m.unknown}</dd><dt>{m.review}</dt><dd>{test.review ?? m.unknown}</dd><dt>{m.source}</dt><dd>{String(raw?.source_ref ?? raw?._source_path ?? state.science_projection_v1?.source.projection_ref ?? m.unknown)}</dd></dl><a href={labHref('entidade', test.id)}>{m.original}</a></details>
  </main>;
}

export function OperationView({state, lang}: {state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], rows = useMemo(() => operationRows(state), [state]);
  const [filter, setFilter] = useState<OperationGroup>('human'), [limit, setLimit] = useState(PAGE_SIZE);
  const current = rows.filter(row => row.groups.includes(filter));
  return <main className="pw-page">
    <header className="pw-page-title"><p>{m.private}</p><h1 tabIndex={-1} data-private-heading>{m.operations}</h1><p>{m.operationsLead}</p></header>
    <div className="pw-tabs" role="group" aria-label={m.operations}>{(['human', 'running', 'blocked', 'waiting'] as const).map(key => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE_SIZE); }}>{m[key]}<span>{rows.filter(row => row.groups.includes(key)).length}</span></button>)}</div>
    <div className="pw-operations" aria-live="polite">{current.slice(0, limit).map(row => <article key={`${row.source}:${row.id}`} className="pw-operation">
      <p className="pw-eyebrow">{domainName(row.domain, lang)} / {m[filter]}</p><h2>{row.title}</h2>
      {row.question && <div className="pw-decision"><h3>{m.decision}</h3><p>{row.question}</p></div>}
      <dl><dt>{m.reason}</dt><dd>{row.reason ?? m.unknown}</dd><dt>{m.next}</dt><dd>{row.next ?? m.unknown}</dd></dl>
      <details><summary>{m.technical}</summary><dl><dt>{m.id}</dt><dd>{row.id}</dd><dt>{m.status}</dt><dd>{row.status}</dd><dt>{m.source}</dt><dd>{row.sourceRef ?? m.unknown}</dd></dl></details>
    </article>)}</div>
    {!current.length && <p className="pw-empty" role="status">{rows.length ? m.emptyOperation : m.operationEmpty}</p>}
    <p className="pw-workflow-link"><a href={hashForView('INBOX')}>{m.decisionFlow} →</a></p>
    {current.length > limit && <button type="button" className="pw-button" onClick={() => setLimit(value => value + PAGE_SIZE)}>{m.more}</button>}
  </main>;
}
