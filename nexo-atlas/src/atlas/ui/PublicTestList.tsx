import {useExplorerState} from './useExplorerState.ts';
import {useMemo, useEffect, useRef} from 'react';
import type {Locale} from '../api.ts';
import type {PublicTest} from '../publicItems.ts';
import {filterPublicQuestions, groupPublicQuestions, newestPublicQuestions} from '../publicQuestionGroups.ts';
import PublicQuestionView from './PublicQuestionView.tsx';
import {mentionedTopics,normalized,SOFTWARE_QUESTIONS,TOPICS} from '../researchExplorer.ts';
import type {PublicVisual} from '../publicVisuals.ts';
const PAGE_SIZE = 8;
export default function PublicTestList({tests, locale,visuals=[]}: {tests: PublicTest[]; locale: Locale;visuals?:PublicVisual[]}) {
  const [query, setQuery] = useExplorerState<string>('catalog.query',''), [page, setPage] = useExplorerState<number>('catalog.page',0);
  const [topic,setTopic]=useExplorerState<string>('catalog.topic',''),[method,setMethod]=useExplorerState<string>('catalog.method','');
  const list=useRef<HTMLDivElement>(null);
  const changePage=(next:number)=>{setPage(next);requestAnimationFrame(()=>{list.current?.scrollIntoView({block:'start',behavior:'instant'});const target=list.current?.querySelector<HTMLElement>('h3')??list.current;if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}});};
  const requested=new URLSearchParams(window.location.search).get('pergunta');
  useEffect(()=>{if(!requested)return;const frame=requestAnimationFrame(()=>{list.current?.scrollIntoView({block:'start',behavior:'instant'});const target=list.current?.querySelector<HTMLElement>('h3')??list.current;if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}});return()=>cancelAnimationFrame(frame);},[requested]);
  const en = locale === 'en', searching = Boolean(query.trim());
  const groups = useMemo(() => groupPublicQuestions(tests), [tests]);
  const filtered = useMemo(() => newestPublicQuestions(filterPublicQuestions(groups, query, locale)).filter(g=>(!topic||mentionedTopics([g.title['pt-BR'],...g.members.map(m=>m.test.method['pt-BR'])].join(' '),SOFTWARE_QUESTIONS.has(g.id.replace(/^question-/,''))).includes(topic as typeof TOPICS[number]['id']))&&(!method||g.members.some(m=>normalized(m.test.method[locale]).includes(normalized(method.trim()))))), [groups, query, locale,topic,method]);
  const testCount = filtered.reduce((sum, group) => sum + group.members.length, 0);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pages - 1);
  if(requested){const selected=groups.find(g=>g.id===requested);return <div className="atlas-test-list" ref={list} tabIndex={-1}><a className="atlas-campaign-back" href="?#/">← {en?'All questions':'Todas as perguntas'}</a>{selected?<PublicQuestionView group={selected} locale={locale} searching={true} visuals={visuals}/>:<p>{en?'This question is not available among the published studies.':'Esta pergunta não está disponível nos estudos publicados.'}</p>}</div>;}
  return <div className="atlas-test-list" ref={list} tabIndex={-1}>
    <p className="atlas-note atlas-test-count-note">{en ? 'Analyses are grouped by physical question. Variants and repeated analyses test robustness and are not independent discoveries.' : 'As análises estão agrupadas por questão física. Variações e repetições avaliam a robustez; não representam descobertas independentes.'}</p>
    {en && tests.some(test => test.question.en === test.question['pt-BR']) && <p className="atlas-note">Some research summaries are currently available only in Portuguese.</p>}
    <div className="atlas-test-search"><label htmlFor="public-test-search">{en ? 'Find a question or test' : 'Buscar pergunta ou teste'}</label><input id="public-test-search" type="search" value={query} onChange={e => {setQuery(e.target.value); setPage(0);}} placeholder={en ? 'Question, data, method or result' : 'Pergunta, dados, método ou resultado'}/><p role="status">{en ? `${filtered.length} ${filtered.length === 1 ? 'question investigated' : 'questions investigated'} · ${testCount} ${testCount === 1 ? 'associated test' : 'associated tests'}` : `${filtered.length} ${filtered.length === 1 ? 'pergunta investigada' : 'perguntas investigadas'} · ${testCount} ${testCount === 1 ? 'teste associado' : 'testes associados'}`}{searching && (en ? ' matching this search' : ' nesta busca')}</p></div>
    <div className="nexo-filter-row"><label>{en?'Subject mentioned':'Assunto mencionado'}<select value={topic} onChange={e=>{setTopic(e.target.value);setPage(0);}}><option value="">{en?'All subjects':'Todos os assuntos'}</option>{TOPICS.filter(t=>t.id!=='software').map(t=><option key={t.id} value={t.id}>{t.label[locale]}</option>)}</select></label><label>{en?'Filter the published method':'Filtrar o método publicado'}<input type="search" value={method} onChange={e=>{setMethod(e.target.value);setPage(0);}} placeholder={en?'For example: bootstrap':'Por exemplo: bootstrap'}/></label></div>
    {filtered.length === 0 && <div className="nexo-filter-empty"><p>{en ? 'No questions or tests match this search.' : 'Nenhuma pergunta ou teste corresponde a esta busca.'}</p>{(query||topic||method)&&<button type="button" className="atlas-text-action nexo-state-retry" onClick={()=>{setQuery('');setTopic('');setMethod('');setPage(0);}}>{en?'Clear filters':'Limpar filtros'}</button>}</div>}
    {filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(group => <PublicQuestionView key={`${group.id}:${query}:${locale}`} group={group} overview={groups.find(complete => complete.id === group.id)!} locale={locale} searching={searching||Boolean(method)} visuals={visuals}/>)}
    {pages > 1 && <nav className="atlas-test-pagination" aria-label={en ? 'Question pages' : 'Páginas de perguntas'}><button type="button" className="atlas-btn" disabled={current === 0} onClick={() => changePage(current - 1)}>{en ? 'Previous' : 'Anterior'}</button><span>{en ? `Page ${current + 1} of ${pages}` : `Página ${current + 1} de ${pages}`}</span><button type="button" className="atlas-btn" disabled={current + 1 === pages} onClick={() => changePage(current + 1)}>{en ? 'Next' : 'Próxima'}</button></nav>}
  </div>;
}
