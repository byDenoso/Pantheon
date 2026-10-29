import {useEffect, useMemo, useState, type ReactNode} from 'react';
import type {SystemState} from '../contracts/system.ts';
import type {Lab, TestEntity} from '../features/lab/model.ts';
import {normDomain} from '../features/lab/domains.ts';
import {describeState, type Lang} from '../i18n/state-language.ts';
import {WORKSPACE_COPY, countPhrase, domainName, operationStateLabel, relationPhrase} from './copy.ts';
import {canonicalTestRecord, coverageOf, dateParts, domainOutline, domainSummary, domainTestIndex, filterTests, hasRelations, laneRows, operationRows, researchHref, testHref, testRelations,
  type DomainOutline, type OperationGroup, type OperationRow, type ResearchFilter, type TestLink} from './model.ts';
import {DateText, SourceValue, hasValue} from './Value.tsx';
import WriterOperations from './WriterOperations.tsx';

export {SourceValue} from './Value.tsx';
const PAGE_SIZE = 40;

/** A recorded state said in words. The published code stays in the technical detail of each page. */
function StateLine({label, value, lang, meaning = false}: {label: string; value: string | null; lang: Lang; meaning?: boolean}) {
  const state = describeState(value, lang);
  return <div className="pw-state-line"><dt>{label}</dt><dd><span className={state.known ? 'pw-state' : 'pw-state pw-absent'}>{state.label}</span>{meaning && <span className="pw-state-meaning">{state.meaning}</span>}</dd></div>;
}
function PageTitle({trail, title, lead, children}: {trail: ReactNode; title: string; lead?: string; children?: ReactNode}) {
  return <header className="pw-page-title"><p className="pw-trail">{trail}</p><h1 tabIndex={-1} data-private-heading data-long={title.length > 56 ? '' : undefined}>{title}</h1>{lead && <p className="pw-lead">{lead}</p>}{children}</header>;
}
const pathOf = (test: TestEntity, lang: Lang) => [domainName(normDomain(test.domain), lang), test.subdomain, test.topic].filter(Boolean).join(' › ');

// ---------------------------------------------------------------- Domains
export function DomainView({tests, lab, state, lang}: {tests: readonly TestEntity[]; lab: Lab; state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], coverage = coverageOf(state, 'tests');
  const outlines = useMemo(() => { const index = domainTestIndex(tests,state); return [...index.keys()].sort().map(domain => domainOutline(tests,lab,state,domain,index)); }, [tests,lab,state]);
  return <main className="pw-page">
    <PageTitle trail={m.private} title={m.domains} lead={m.domainsLead}/>
    {outlines.length > 0 && <ol className="pw-index">{outlines.map(outline => <li key={outline.domain}>
      <h2><a href={researchHref(outline.domain)}>{domainName(outline.domain, lang)}<span aria-hidden="true"> →</span></a></h2>
      <DomainMembership outline={outline} lang={lang}/>
      {outline.description && <p className="pw-index-lead">{outline.description}</p>}
      <p className="pw-facts">{[countPhrase(outline.tests, 'test', lang, coverage), ...(coverage === 'unavailable' ? [] : [countPhrase(outline.results, 'result', lang), countPhrase(outline.pending, 'pending', lang)])].join(' · ')}</p>
      {(outline.subdomains.length > 0 || outline.campaigns.length > 0 || outline.hypotheses.length > 0) && <p className="pw-facts pw-facts-quiet">{[
        outline.subdomains.length ? countPhrase(outline.subdomains.length, 'subdomain', lang) : null,
        outline.campaigns.length ? countPhrase(outline.campaigns.length, 'campaign', lang) : null,
        outline.hypotheses.length ? countPhrase(outline.hypotheses.length, 'hypothesis', lang) : null].filter(Boolean).join(' · ')}</p>}
      {outline.lane?.current && <dl className="pw-pairs"><div><dt>{m.domainState}</dt><dd>{outline.lane.current}</dd></div>{outline.lane.next && <div><dt>{m.domainNext}</dt><dd>{outline.lane.next}</dd></div>}</dl>}
    </li>)}</ol>}
    {outlines.length > 0 ? <p className="pw-note">{m.derived}</p> : <p className="pw-empty" role="status">{coverage === 'unavailable' ? m.collectionUnavailable : m.domainsEmpty}</p>}
  </main>;
}

function DomainMembership({outline, lang}: {outline: DomainOutline; lang: Lang}) {
  const m = WORKSPACE_COPY[lang];
  return <div className="pw-quiet">
    {outline.tests === 0 && outline.entities !== null && <p>{outline.entities} {m.recordedEntities}</p>}
    {outline.parents.length > 0 && <p>{m.childOf} {outline.parents.map(parent => <a key={parent} href={researchHref(parent)}>{domainName(parent,lang)}</a>)}</p>}
    {outline.surfaces.length > 0 && <><p>{m.domainSurface} {outline.surfaces.map(id => domainName(id,lang)).join(' / ')}</p>
      <details className="pw-technical"><summary>{m.technical}</summary>{outline.surfaceEvidence.map((item,index)=><dl className="pw-pairs" key={index}>
        <div><dt>{m.id}</dt><dd className="pw-code">{item.surface} → {item.owner}</dd></div>
        <div><dt>{m.domainSurface}</dt><dd className="pw-code">{item.source_value}</dd></div>
        <div><dt>{m.source}</dt><dd className="pw-code">{item.path}#{item.field}<br/>{item.source_ref}</dd></div>
        <div><dt>{m.boardRevision}</dt><dd className="pw-code">{item.source_revision}</dd></div>
      </dl>)}</details></>}
    {outline.aliases.length > 1 && <p>{m.sameDomain} {outline.aliases.join(' / ')}</p>}
    {outline.inheritedTests > 0 && <p>{outline.directTests} {m.directTests} · {outline.inheritedTests} {m.linkedTests}. {m.uniqueDomainCounts}</p>}
    {outline.retiredTests > 0 && <p>{outline.retiredTests} {m.retiredIncluded}</p>}
  </div>;
}

function Outline({outline, lang}: {outline: DomainOutline; lang: Lang}) {
  const m = WORKSPACE_COPY[lang];
  if (!outline.subdomains.length && !outline.campaigns.length && !outline.hypotheses.length) return <section className="pw-outline" aria-label={m.structure}><h2>{m.structure}</h2><p className="pw-absent">{m.noStructure}</p></section>;
  return <section className="pw-outline" aria-label={m.structure}>
    <h2>{m.structure}</h2><p className="pw-muted">{m.structureLead}</p>
    {outline.lane && (outline.lane.current || outline.lane.next || outline.lane.blockers.length > 0) && <dl className="pw-pairs">
      {outline.lane.current && <div><dt>{m.domainState}</dt><dd>{outline.lane.current}</dd></div>}
      {outline.lane.next && <div><dt>{m.domainNext}</dt><dd>{outline.lane.next}</dd></div>}
      {outline.lane.blockers.length > 0 && <div><dt>{m.domainBlockers}</dt><dd><ul className="pw-list">{outline.lane.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul></dd></div>}
    </dl>}
    <div className="pw-folds">
      {outline.subdomains.length > 0 && <details open><summary>{m.subdomains}<span>{outline.subdomains.length}</span></summary><ul className="pw-tree">{outline.subdomains.map(sub => <li key={sub.key}>
        <strong>{sub.named ? sub.label : m.unnamedSubdomain}</strong> {!sub.named && <span className="pw-code">{sub.key}</span>} <span className="pw-quiet">{countPhrase(sub.tests, 'test', lang)}</span>
        {sub.topics.length > 0 && <ul aria-label={m.topics}>{sub.topics.map(topic => <li key={topic.key}>{topic.named ? topic.label : m.unnamedTopic} {!topic.named && <span className="pw-code">{topic.key}</span>} <span className="pw-quiet">{countPhrase(topic.tests, 'test', lang)}</span></li>)}</ul>}
      </li>)}{outline.withoutSubdomain > 0 && <li className="pw-quiet">{countPhrase(outline.withoutSubdomain, 'test', lang)}, {m.noSubdomain}</li>}</ul></details>}
      {outline.campaigns.length > 0 && <details><summary>{m.campaigns}<span>{outline.campaigns.length}</span></summary><ul className="pw-entries">{outline.campaigns.map(item => <li key={item.id}>
        <h3>{item.title ?? m.untitledCampaign}</h3>
        {item.question && item.question !== item.title && <p>{item.question}</p>}
        {item.why && <p className="pw-muted"><span className="pw-label">{m.campaignWhy}: </span>{item.why}</p>}
        <p className="pw-quiet">{countPhrase(item.tests, 'test', lang)} · <span className="pw-code">{item.id}</span></p>
      </li>)}</ul></details>}
      {outline.hypotheses.length > 0 && <details><summary>{m.hypotheses}<span>{outline.hypotheses.length}</span></summary><ul className="pw-entries">{outline.hypotheses.map(item => <li key={item.id}>
        {item.statement ? <p>{item.statement}</p> : <p className="pw-absent">{m.hypothesisUnstated}</p>}
        <p className="pw-quiet">{countPhrase(item.tests, 'test', lang)} · <span className="pw-code">{item.id}</span></p>
      </li>)}</ul></details>}
    </div>
  </section>;
}

// ---------------------------------------------------------------- Tests of a domain / all tests
export function ResearchView({tests, lab, state, domain, filter, lang}: {tests: readonly TestEntity[]; lab: Lab; state: SystemState; domain: string | null; filter: ResearchFilter; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], coverage = coverageOf(state, 'tests');
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(PAGE_SIZE);
  const rows = useMemo(() => filterTests(tests, domain, filter, query, state), [tests, domain, filter, query, state]);
  const domains = useMemo(() => domainSummary(tests, state), [tests, state]);
  const outline = useMemo(() => domain === null ? null : domainOutline(tests, lab, state, domain), [tests, lab, state, domain]);
  const counts = useMemo(() => ({all: filterTests(tests, domain, 'all', '', state).length, results: filterTests(tests, domain, 'results', '', state).length, pending: filterTests(tests, domain, 'pending', '', state).length}), [tests, domain, state]);
  useEffect(() => setLimit(PAGE_SIZE), [filter]);
  const shown = rows.slice(0, limit);
  return <main className="pw-page">
    <PageTitle trail={<a href="#/teia/dominios">{m.domains}</a>} title={domain === null ? m.tests : domainName(domain, lang)} lead={outline?.description ?? (domain === null ? m.researchLead : undefined)}/>
    {outline && <DomainMembership outline={outline} lang={lang}/>}
    {outline && <Outline outline={outline} lang={lang}/>}
    <section aria-label={m.tests}>
      <h2 className={domain === null ? 'pw-sr' : 'pw-section-title'}>{m.tests}</h2>{domain !== null && <p className="pw-muted">{m.researchLead}</p>}
      <div className="pw-tools">
        <label>{m.domains}<select value={domain ?? ''} onChange={event => { window.location.hash = researchHref(event.target.value || null, filter).slice(1); }}><option value="">{m.allDomains}</option>{domains.map(row => <option key={row.domain} value={row.domain}>{domainName(row.domain, lang)}</option>)}</select></label>
        <label className="pw-search">{m.search}<input type="search" value={query} placeholder={m.searchPlaceholder} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}/></label>
      </div>
      <nav className="pw-tabs" aria-label={m.filterBy}>{(['all', 'results', 'pending'] as const).map(key => <a key={key} href={researchHref(domain, key)} aria-current={filter === key ? 'page' : undefined}>{m[key]}{coverage !== 'unavailable' && <span>{coverage === 'partial' ? `${counts[key]}+` : counts[key]}</span>}</a>)}</nav>
      <p className="pw-quiet" role="status" aria-live="polite">{rows.length ? `${m.showing} ${shown.length} ${m.of} ${rows.length}` : coverage === 'unavailable' ? m.collectionUnavailable : query.trim() ? m.noneQuery : m.none}</p>
      {query.trim() && !rows.length && <button type="button" className="pw-button" onClick={() => { setQuery(''); setLimit(PAGE_SIZE); }}>{lang === 'en' ? 'Clear search' : 'Limpar busca'}</button>}
      {shown.length > 0 && <ol className="pw-rows">{shown.map(test => { const campaign = test.campaignId ? lab.campaigns.get(test.campaignId)?.title : null; return <li key={test.id}>
        <p className="pw-path">{pathOf(test, lang)}</p>
        <h3><a href={testHref(test.id)}>{test.name}</a></h3>
        {test.question && test.question !== test.name && <p className="pw-row-question">{test.question}</p>}
        {campaign && <p className="pw-quiet">{m.campaign}: {campaign}</p>}
        <dl className="pw-states"><StateLine label={m.execution} value={test.status} lang={lang}/><StateLine label={m.review} value={test.review} lang={lang}/></dl>
      </li>; })}</ol>}
      {rows.length > limit && <button type="button" className="pw-button" onClick={() => setLimit(value => value + PAGE_SIZE)}>{m.more} ({Math.min(PAGE_SIZE, rows.length - limit)})</button>}
    </section>
  </main>;
}

// ---------------------------------------------------------------- One test
const LinkList = ({links, lang}: {links: readonly TestLink[]; lang: Lang}) => <ul className="pw-list">{links.map(link => <li key={link.id}>{link.present ? <a href={testHref(link.id)}>{link.name ?? link.id}</a> : <>{link.name ?? <span className="pw-code">{link.id}</span>} <span className="pw-absent">({WORKSPACE_COPY[lang].absentLink})</span></>}</li>)}</ul>;

export function TestDetail({test, lab, state, lang}: {test: TestEntity; lab: Lab; state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], raw = canonicalTestRecord(state, test.id), domain = normDomain(test.domain);
  const relations = useMemo(() => testRelations(test, lab, state), [test, lab, state]);
  const recipe = raw?.recipe ?? raw?.recipe_spec ?? raw?.recipe_contract, recipeRef = raw?.recipe_ref ?? raw?.recipe_id;
  // the most decisive recorded state: a review conclusion, then the review in progress, then the run verdict, then where the test is in its life
  const review = describeState(test.review, lang), verdict = describeState(test.verdictRaw, lang), progress = describeState(test.status, lang);
  const standing = review.known ? review : verdict.known ? verdict : progress;
  const prereg = Object.fromEntries(Object.entries({metric: test.prereg.metric, threshold: test.prereg.threshold, prediction: test.prereg.prediction, null_model: test.prereg.null_model, rival: test.prereg.rival, success: test.prereg.success, kill: test.prereg.kill, at: test.prereg.at, ref: test.prereg.ref, hash: test.prereg.hash}).filter(([, value]) => hasValue(value)));
  const limits = [[m.limitations, test.limitations], [m.claimBoundary, test.claimBoundary], [m.claimLevel, test.claimLevel]].filter(([, value]) => hasValue(value)) as Array<[string, unknown]>;
  const execution = (raw?.execution ?? test.execution) as Record<string, unknown> | null;
  const executionRest = execution && typeof execution === 'object' ? Object.fromEntries(Object.entries(execution).filter(([key]) => !['at', 'battery_id', 'run_ref', 'runner'].includes(key))) : null;
  const rawText = raw ? JSON.stringify(raw, null, 2) : null;
  return <main className="pw-page pw-test">
    <PageTitle trail={<><a href={researchHref(domain)}>{domainName(domain, lang)}</a>{[test.subdomain, test.topic].filter(Boolean).map(part => <span key={part}> › {part}</span>)}</>} title={test.name}>
      <p className="pw-quiet"><a className="pw-back" href={researchHref(domain)}>← {m.back}</a></p>
    </PageTitle>

    <section className="pw-block" aria-labelledby="pw-q"><h2 id="pw-q">{m.question}</h2>
      {test.question ? test.question.length > 240 ? <SourceValue value={test.question} lang={lang}/> : <p className="pw-question">{test.question}</p> : <p className="pw-absent">{m.noQuestion}</p>}
    </section>

    <section className="pw-block" aria-labelledby="pw-a"><h2 id="pw-a">{m.answer}</h2>
      <h3>{m.meaning}</h3>
      {test.meaning ? <SourceValue value={test.meaning} lang={lang}/> : <p className="pw-absent">{m.noMeaning}</p>}
      <h3>{m.standing}</h3>
      <p className="pw-standing">{standing.meaning}</p><p className="pw-quiet">{m.standingNote}</p>
      {hasValue(test.result) && <><h3>{m.values}</h3><SourceValue value={test.result} lang={lang}/></>}
      {hasValue(test.statistics) && <><h3>{m.statistics}</h3><SourceValue value={test.statistics} lang={lang}/></>}
    </section>

    <section className="pw-block pw-limits" aria-labelledby="pw-l"><h2 id="pw-l">{m.limits}</h2>
      {limits.length ? limits.map(([label, value]) => <div key={label}><h3>{label}</h3><SourceValue value={value} lang={lang}/></div>) : <p className="pw-absent">{m.noLimits}</p>}
    </section>

    <section className="pw-block" aria-labelledby="pw-r"><h2 id="pw-r">{m.relations}</h2>
      {hasRelations(relations) ? <dl className="pw-pairs">
        {relations.campaign && <div><dt>{m.campaign}</dt><dd>{relations.campaign.title ?? <span className="pw-code">{relations.campaign.id}</span>}{relations.campaign.question && relations.campaign.question !== relations.campaign.title && <span className="pw-state-meaning">{relations.campaign.question}</span>}</dd></div>}
        {relations.hypothesis && <div><dt>{m.hypothesis}</dt><dd>{relations.hypothesis.statement ?? <><span className="pw-code">{relations.hypothesis.id}</span> <span className="pw-absent">({m.hypothesisUnstated})</span></>}</dd></div>}
        {relations.roadmap && <div><dt>{m.roadmap}</dt><dd>{relations.roadmap.title ?? <span className="pw-code">{relations.roadmap.id}</span>}</dd></div>}
        {relations.dependsOn.length > 0 && <div><dt>{m.dependsOn}</dt><dd><LinkList links={relations.dependsOn} lang={lang}/></dd></div>}
        {relations.requiredBy.length > 0 && <div><dt>{m.requiredBy}</dt><dd><LinkList links={relations.requiredBy} lang={lang}/></dd></div>}
        {relations.contestOf && <div><dt>{m.contestOf}</dt><dd><LinkList links={[relations.contestOf]} lang={lang}/></dd></div>}
        {relations.contestedBy.length > 0 && <div><dt>{m.contestedBy}</dt><dd><LinkList links={relations.contestedBy} lang={lang}/></dd></div>}
        {relations.graph.length > 0 && <div><dt>{m.otherLinks}</dt><dd><ul className="pw-list">{relations.graph.map(link => <li key={link.key}>{relationPhrase(link.kind, link.direction, lang)} {link.otherLabel ?? <span className="pw-code">{link.otherId}</span>}{link.explanation && <span className="pw-state-meaning">{link.explanation}</span>}</li>)}</ul></dd></div>}
      </dl> : <p className="pw-absent">{m.noRelations}</p>}
    </section>

    <div className="pw-two">
      <section className="pw-block" aria-labelledby="pw-e"><h2 id="pw-e">{m.execution}</h2><p className="pw-muted">{m.executionLead}</p>
        <dl className="pw-pairs">
          <StateLine label={m.status} value={test.status} lang={lang} meaning/>
          {test.verdictRaw && <StateLine label={m.verdictCode} value={test.verdictRaw} lang={lang} meaning/>}
          {test.createdAt && <div><dt>{m.createdAt}</dt><dd><DateText value={test.createdAt} lang={lang}/></dd></div>}
          {(test.executedAt ?? test.execution?.at) && <div><dt>{m.executedAt}</dt><dd><DateText value={test.executedAt ?? test.execution?.at} lang={lang}/></dd></div>}
          {test.execution?.runner && <div><dt>{m.runner}</dt><dd>{test.execution.runner}</dd></div>}
          {test.execution?.battery_id && <div><dt>{m.battery}</dt><dd className="pw-code">{test.execution.battery_id}</dd></div>}
          {test.execution?.run_ref && <div><dt>{m.runRef}</dt><dd className="pw-code">{test.execution.run_ref}</dd></div>}
          {test.readiness && <div><dt>{m.readiness}</dt><dd>{test.readiness.eligible ? m.eligible : m.ineligible}{test.readiness.reasons.length > 0 && <ul className="pw-list">{test.readiness.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}</dd></div>}
          {test.blocker && <div><dt>{m.blocker}</dt><dd>{test.blocker}</dd></div>}
        </dl>
        {executionRest && hasValue(executionRest) && <SourceValue value={executionRest} lang={lang}/>}
      </section>
      <section className="pw-block" aria-labelledby="pw-v"><h2 id="pw-v">{m.review}</h2><p className="pw-muted">{m.reviewLead}</p>
        <dl className="pw-pairs"><StateLine label={m.reviewCode} value={test.review} lang={lang} meaning/></dl>
        <h3>{m.reviewSteps}</h3>
        {test.reviews.length ? <ol className="pw-steps">{test.reviews.map((step, index) => {
          const outcome = step.outcome ? describeState(step.outcome, lang) : null, when = dateParts(step.at, lang);
          const who = [step.by ? `${m.reviewBy} ${step.by}` : null, step.axis ? `${m.reviewAxis} ${step.axis}` : null].filter(Boolean).join(' · ');
          return <li key={index}>
            <span><strong>{step.kind}</strong>{outcome && <> · {outcome.known ? outcome.label : <span className="pw-code">{step.outcome}</span>}</>}</span>
            {(who || when) && <span className="pw-quiet">{who}{who && when && ' · '}{when && <time dateTime={when.iso} title={when.iso}>{when.label}</time>}</span>}
          </li>; })}</ol> : <p className="pw-absent">{m.noReviewSteps}</p>}
        {hasValue(test.robustness) && <><h3>{m.robustness}</h3><SourceValue value={test.robustness} lang={lang}/></>}
      </section>
    </div>

    <div className="pw-folds">
      <details><summary>{m.data}</summary><div><h3>{m.datasets}</h3><SourceValue value={raw?.datasets ?? test.datasets} lang={lang}/><h3>{m.artifacts}</h3><SourceValue value={raw?.artifacts ?? test.artifacts} lang={lang}/></div></details>
      <details><summary>{m.method}</summary><div>
        <h3>{m.methodText}</h3><SourceValue value={test.method ?? raw?.method} lang={lang}/>
        <h3>{m.prereg}</h3><SourceValue value={prereg} lang={lang}/>
        <h3>{m.recipe}</h3><SourceValue value={recipe} lang={lang} empty={m.unavailableRecipe}/>
        {recipeRef != null && <><h3>{m.recipeRef}</h3><SourceValue value={recipeRef} lang={lang}/></>}
      </div></details>
      <details className="pw-technical"><summary>{m.technical}</summary><div>
        <dl className="pw-pairs">
          <div><dt>{m.id}</dt><dd className="pw-code">{test.id}</dd></div>
          <div><dt>{m.status}</dt><dd className="pw-code">{test.status ?? m.notRecorded}</dd></div>
          <div><dt>{m.reviewCode}</dt><dd className="pw-code">{test.review ?? m.notRecorded}</dd></div>
          <div><dt>{m.verdictCode}</dt><dd className="pw-code">{test.verdictRaw ?? m.notRecorded}</dd></div>
          {test.createdAt && <div><dt>{m.createdAt}</dt><dd className="pw-code">{test.createdAt}{test.createdSource ? ` (${test.createdSource})` : ''}</dd></div>}
          <div><dt>{m.source}</dt><dd className="pw-code">{String(raw?.source_ref ?? raw?._source_path ?? state.science_projection_v1?.source.projection_ref ?? m.notRecorded)}</dd></div>
        </dl>
        {rawText && <><h3>{m.raw}</h3><pre className="pw-raw" tabIndex={0}>{rawText.slice(0, 16000)}</pre>{rawText.length > 16000 && <p className="pw-absent">{m.clipped}</p>}</>}
      </div></details>
    </div>
  </main>;
}

// ---------------------------------------------------------------- Operation
function OperationItem({row, lang}: {row: OperationRow; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], state = describeState(row.status, lang);
  return <li>
    <p className="pw-path">{domainName(row.domain, lang)}</p>
    <h3>{row.title}</h3>
    {row.question && <div className="pw-decision"><p className="pw-label">{m.decision}</p><p className="pw-question">{row.question}</p></div>}
    {row.options.length > 0 && <div className="pw-options"><p className="pw-label">{m.options}</p><ul>{row.options.map(option => <li key={option.id}><strong>{option.label}</strong>{option.consequence && <span className="pw-state-meaning"><span className="pw-label">{m.consequence}: </span>{option.consequence}</span>}</li>)}</ul><p className="pw-quiet">{m.viewOnly}</p></div>}
    <dl className="pw-pairs">
      <div><dt>{m.status}</dt><dd>{operationStateLabel(row.status, lang) ?? (state.known ? state.label : <span className="pw-code">{row.status}</span>)}</dd></div>
      <div><dt>{m.reason}</dt><dd>{row.reason ?? <span className="pw-absent">{m.notRecorded}</span>}</dd></div>
      <div><dt>{m.next}</dt><dd>{row.next ?? <span className="pw-absent">{m.notRecorded}</span>}</dd></div>
      {row.humanNeeds.length > 0 && <div><dt>{m.humanNeeds}</dt><dd><ul className="pw-list">{row.humanNeeds.map(item => <li key={item.id}>{item.label}{item.detail && <span className="pw-state-meaning">{item.detail}</span>}</li>)}</ul></dd></div>}
      {row.automaticNeeds.length > 0 && <div><dt>{m.automaticNeeds}</dt><dd><ul className="pw-list">{row.automaticNeeds.map(item => <li key={item.id}>{item.label}{item.detail && <span className="pw-state-meaning">{item.detail}</span>}</li>)}</ul></dd></div>}
      {row.where && <div><dt>{m.where}</dt><dd>{row.where}</dd></div>}
      {row.dueAt && <div><dt>{m.dueAt}</dt><dd><DateText value={row.dueAt} lang={lang}/></dd></div>}
      {row.since && <div><dt>{m.since}</dt><dd><DateText value={row.since} lang={lang}/></dd></div>}
    </dl>
    <details className="pw-technical"><summary>{m.technical}</summary><dl className="pw-pairs"><div><dt>{m.id}</dt><dd className="pw-code">{row.id}</dd></div><div><dt>{m.status}</dt><dd className="pw-code">{row.status}</dd></div><div><dt>{m.source}</dt><dd className="pw-code">{row.sourceRef ?? m.notRecorded}</dd></div></dl></details>
  </li>;
}

export function OperationView({state, lang}: {state: SystemState; lang: Lang}) {
  const m = WORKSPACE_COPY[lang], rows = useMemo(() => operationRows(state), [state]), lanes = useMemo(() => laneRows(state).filter(lane => lane.current || lane.next || lane.blockers.length || lane.sideQuests.length), [state]);
  const coverage = coverageOf(state, 'work');
  const [filter, setFilter] = useState<OperationGroup>('human'), [limit, setLimit] = useState(PAGE_SIZE);
  const current = rows.filter(row => row.groups.includes(filter));
  return <main className="pw-page">
    <PageTitle trail={m.private} title={m.operations} lead={m.operationsLead}/>
    <WriterOperations state={state} lang={lang}/>
    <div className="pw-tabs" role="group" aria-label={m.operations}>{(['human', 'running', 'blocked', 'waiting'] as const).map(key => { const n = rows.filter(row => row.groups.includes(key)).length; return <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE_SIZE); }}>{m[key]}{coverage !== 'unavailable' && <span>{coverage === 'partial' ? `${n}+` : n}</span>}</button>; })}</div>
    <div aria-live="polite">
      <h2 className="pw-sr">{m[filter]}</h2>
      {current.length > 0 ? <ol className="pw-rows pw-ops">{current.slice(0, limit).map(row => <OperationItem key={`${row.source}:${row.id}`} row={row} lang={lang}/>)}</ol> : <p className="pw-empty" role="status">{coverage === 'unavailable' ? m.collectionUnavailable : rows.length ? m.emptyOperation : m.operationEmpty}</p>}
    </div>
    {current.length > limit && <button type="button" className="pw-button" onClick={() => setLimit(value => value + PAGE_SIZE)}>{m.more} ({Math.min(PAGE_SIZE, current.length - limit)})</button>}
    {lanes.length > 0 && <section className="pw-outline" aria-labelledby="pw-lanes"><h2 id="pw-lanes">{m.byDomain}</h2><ul className="pw-entries">{lanes.map(lane => <li key={lane.domain}>
      <h3>{domainName(lane.domain, lang)}</h3>
      <dl className="pw-pairs">
        {lane.current && <div><dt>{m.domainState}</dt><dd>{lane.current}</dd></div>}
        {lane.next && <div><dt>{m.domainNext}</dt><dd>{lane.next}</dd></div>}
        {lane.blockers.length > 0 && <div><dt>{m.domainBlockers}</dt><dd><ul className="pw-list">{lane.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul></dd></div>}
        {lane.sideQuests.length > 0 && <div><dt>{m.sideQuests}</dt><dd><ul className="pw-list">{lane.sideQuests.map(item => <li key={item.id}>{item.title} <span className="pw-quiet">({operationStateLabel(item.status, lang) ?? describeState(item.status, lang).label})</span></li>)}</ul></dd></div>}
      </dl>
    </li>)}</ul></section>}
  </main>;
}

// ---------------------------------------------------------------- Memory (reserved presentation point; nothing is connected here)
export function MemoryPlaceholder({lang}: {lang: Lang}) {
  const m = WORKSPACE_COPY[lang];
  return <main className="pw-page">
    <PageTitle trail={m.private} title={m.memoryTitle} lead={m.memoryOff}/>
    <p className="pw-muted">{m.memoryLead}</p>
    <ul className="pw-list">{m.memoryLimits.map(item => <li key={item}>{item}</li>)}</ul>
    <p className="pw-workflow-link"><a href="#/teia">← {m.returnWeb}</a></p>
  </main>;
}
