import ArrowIcon from './ArrowIcon.tsx';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {Locale} from '../api.ts';
import {pick} from '../publicItems.ts';
import type {QuestionGroup, QuestionMember} from '../publicQuestionGroups.ts';
import {campaignBrief, campaignConditions, associatedTestKind} from '../publicCampaigns.ts';
import PublicTestView from './PublicTestView.tsx';
import {questionHref,SOFTWARE_QUESTIONS} from '../researchExplorer.ts';
import {visualsForTest,type PublicVisual} from '../publicVisuals.ts';
import {presentLabel,duplicateOrdinals} from '../presentNumbers.ts';
import {testAnchors,testHref} from '../publicStudyRoutes.ts';
import QuestionFigures from './LazyQuestionFigures.tsx';

/** From this many tests on, the list of one investigation gets its own search field. */
const SEARCHABLE_FROM = 8;
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

// `anchor` is the direct-link target of the test. A requested anchor opens its own
// disclosure once, scrolls to it and moves focus there; later toggles belong to the reader.
function TestDisclosure({summary,children,anchor,requested=false}:{summary:ReactNode;children:ReactNode;anchor:string;requested?:boolean}){
  const [mounted,setMounted]=useState(requested),element=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const el=element.current;if(!requested||!el)return;el.open=true;const frame=requestAnimationFrame(()=>{el.scrollIntoView({block:'start',behavior:'instant'});el.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[requested]);
  return <details ref={element} id={anchor} className="atlas-test-variant" data-requested={requested||undefined} onToggle={event=>{if(event.currentTarget.open)setMounted(true);}}>{summary}{mounted&&children}</details>;
}

export default function PublicQuestionView({group, overview = group, locale, searching,visuals=[],standalone=false,openAnchor=null}: {group: QuestionGroup; overview?: QuestionGroup; locale: Locale; searching: boolean;visuals?:PublicVisual[];standalone?:boolean;openAnchor?:string|null}) {
  const SectionHeading=standalone?'h2':'h4';
  const en = locale === 'en';
  const operational = SOFTWARE_QUESTIONS.has(group.id.replace(/^question-/,''));
  const anchors = useMemo(() => testAnchors(overview.members.map(member => member.test)), [overview]);
  const requestedMember = openAnchor ? group.members.find(member => anchors.get(member.test.id) === openAnchor) : undefined;
  const [open, setOpen] = useState(searching || Boolean(requestedMember)),[testsMounted,setTestsMounted]=useState(searching || Boolean(requestedMember));
  const [testQuery, setTestQuery] = useState('');
  const previousAnchor=useRef(openAnchor);
  useEffect(()=>{if(previousAnchor.current===openAnchor)return;previousAnchor.current=openAnchor;if(requestedMember){setOpen(true);setTestsMounted(true);setTestQuery('');}else setOpen(false);},[openAnchor,requestedMember]);
  const count = group.members.length;
  const brief = campaignBrief(overview);
  const conditions = campaignConditions(overview);
  const repeats = overview.members.filter(member => member.repeat).length;
  // Identity of each test is its own record. Rows that happen to show the same
  // label are told apart by an ordinal and their publication date, never merged.
  const identity = (member: QuestionMember) => [associatedTestKind(member, brief, locale), pick(member.label, locale), pick(member.detail, locale)].join('\u0001');
  const ordinals = useMemo(() => { const marks = duplicateOrdinals(overview.members.map(identity)); return new Map(overview.members.map((member, index) => [member.test.id, marks[index]])); }, [overview, locale]);
  const searchable = !searching && count >= SEARCHABLE_FROM, needle = fold(testQuery.trim());
  const shown = searchable && needle ? group.members.filter(member => fold([associatedTestKind(member, brief, locale), ...[member.label, member.detail, member.section, member.test.question, member.test.method, member.test.result, member.test.answers].map(value => pick(value, locale))].join(' ')).includes(needle)) : group.members;
  const groupVisuals = useMemo(() => { if (!standalone || !visuals.length) return {visuals: [] as PublicVisual[], links: {}}; const seen = new Set<string>(), all: PublicVisual[] = [], links: Record<string, {question: QuestionMember['test']['question']; href: string}> = {}; for (const member of overview.members) for (const visual of visualsForTest(visuals, member.test)) { if (seen.has(visual.id)) continue; seen.add(visual.id); all.push(visual); links[visual.id] = {question: member.test.question, href: testHref(overview.id, anchors.get(member.test.id))}; } return {visuals: all, links}; }, [standalone, visuals, overview, anchors]);
  const date = (value: string) => new Intl.DateTimeFormat(en ? 'en-GB' : 'pt-BR', {dateStyle: 'medium', timeZone: 'America/Sao_Paulo'}).format(new Date(value));
  const sections: [string, QuestionMember[]][] = [];
  for (const member of shown) {
    const section = pick(member.section, locale);
    const previous = sections.at(-1);
    if (previous?.[0] === section) previous[1].push(member);
    else sections.push([section, [member]]);
  }
  return <article className="atlas-question-group atlas-campaign-update" id={`update-${group.id}`} aria-labelledby={standalone?'study-title':`${group.id}-title`}>
    <p className="atlas-campaign-kicker">{operational ? (en ? 'Software validation' : 'Validação de software') : (en ? 'Cosmology · Research summary' : 'Cosmologia · Síntese da investigação')}</p>
    {!standalone&&<h3 id={`${group.id}-title`}><a className="nexo-question-link" href={questionHref(group.id)}>{pick(group.title, locale)}<span className="nexo-share-arrow"><ArrowIcon/></span></a></h3>}
    {brief ? <>
      <div className="atlas-campaign-reading">
        <div><SectionHeading>{en ? 'What we learned' : 'O que aprendemos'}</SectionHeading><p>{pick(brief.summary, locale)}</p></div>
        <div className="atlas-campaign-boundary"><SectionHeading>{en ? 'Limits of the conclusion' : 'Limites da conclusão'}</SectionHeading><p>{pick(brief.limits, locale)}</p></div>
        
      </div>
      <details className="atlas-campaign-conditions">
        <summary>{en ? 'Common basis and variations' : 'Base comum e variações'}<span className="atlas-disclosure-icon" aria-hidden="true">+</span></summary>
        <p>{pick(brief.basis, locale)}</p>
        {conditions.length > 0 && <dl>{conditions.map(condition => <div key={condition.key} data-shared={condition.shared}><dt>{pick(condition.label, locale)}</dt><dd>{presentLabel(pick(condition.value, locale), locale)}</dd></div>)}</dl>}
        {repeats > 0 && <p className="atlas-campaign-repeats">{en ? `${repeats} associated analyses repeat the same study design and are identified as repetitions.` : `${repeats} análises associadas repetem o mesmo desenho do estudo e estão identificadas como repetições.`}</p>}
      </details>
    </> : pick(group.scope, locale) && <p className="atlas-question-scope">{pick(group.scope, locale)}</p>}
    {groupVisuals.visuals.length > 0 && <QuestionFigures visuals={groupVisuals.visuals} links={groupVisuals.links} locale={locale}/>}
    {count !== group.total && <p className="atlas-campaign-search-note">{en ? 'The summary covers the full investigation. The tests below match your search.' : 'A síntese abrange a investigação completa. A lista abaixo mostra os testes encontrados na busca.'}</p>}
    <details className="atlas-question-details" open={open} onToggle={event => {setOpen(event.currentTarget.open);if(event.currentTarget.open)setTestsMounted(true);}}>
      <summary><span>{en ? `${open ? 'Hide' : 'View'} ${count} ${count === 1 ? 'associated test' : 'associated tests'}` : `${open ? 'Ocultar' : 'Ver'} ${count} ${count === 1 ? 'teste associado' : 'testes associados'}`}</span>{count !== group.total && <span className="atlas-question-total">{en ? `of ${group.total} in this question` : `de ${group.total} nesta pergunta`}</span>}<span className="atlas-disclosure-icon" aria-hidden="true">{open ? '−' : '+'}</span></summary>
      <div className="atlas-question-tests">
        {searchable && <div className="atlas-test-search nexo-question-search"><label htmlFor={`${group.id}-test-search`}>{en ? 'Find a test in this investigation' : 'Buscar teste nesta investigação'}</label><input id={`${group.id}-test-search`} type="search" value={testQuery} onChange={event => setTestQuery(event.target.value)} placeholder={en ? 'Data, configuration, method or result' : 'Dados, configuração, método ou resultado'}/><p role="status">{needle ? (en ? `${shown.length} of ${count} tests match` : `${shown.length} de ${count} testes correspondem`) : (en ? `${count} tests, grouped by what varies` : `${count} testes, agrupados pelo que varia`)}</p></div>}
        {searchable && needle && shown.length === 0 && <div className="nexo-filter-empty"><p>{en ? 'No test in this investigation matches the search.' : 'Nenhum teste desta investigação corresponde à busca.'}</p><button type="button" className="atlas-text-action nexo-state-retry" onClick={() => setTestQuery('')}>{en ? 'Clear search' : 'Limpar busca'}</button></div>}
        {testsMounted&&sections.map(([section, members], sectionIndex) => <div className="atlas-question-section" key={`${section}:${sectionIndex}`}>
          {section && <SectionHeading>{section}</SectionHeading>}
          {members.map(member => group.total === 1 ? <PublicTestView key={member.test.id} test={member.test} standalone={standalone} locale={locale} visuals={visualsForTest(visuals,member.test)} anchor={anchors.get(member.test.id)} requested={member === requestedMember}/> : <TestDisclosure key={member.test.id} anchor={anchors.get(member.test.id)!} requested={member === requestedMember} summary={<summary><span className="atlas-variant-copy"><span className="atlas-variant-kind">{associatedTestKind(member, brief, locale)}</span><span className="atlas-variant-label">{presentLabel(pick(member.label, locale), locale)}</span>{pick(member.detail, locale) && <span className="atlas-variant-detail">{presentLabel(pick(member.detail, locale), locale)}</span>}{ordinals.get(member.test.id) && <span className="atlas-variant-ordinal">{en ? `Record ${ordinals.get(member.test.id)!.index} of ${ordinals.get(member.test.id)!.of} with this label` : `Registro ${ordinals.get(member.test.id)!.index} de ${ordinals.get(member.test.id)!.of} com este rótulo`}{member.test.published_at ? ` · ${en ? 'published on' : 'publicado em'} ${date(member.test.published_at)}` : ''}</span>}</span><span className="atlas-disclosure-icon" aria-hidden="true">+</span></summary>}>
            <PublicTestView test={member.test} standalone={standalone} locale={locale} visuals={visualsForTest(visuals,member.test)}/>
          </TestDisclosure>)}
        </div>)}
      </div>
    </details>
  </article>;
}
