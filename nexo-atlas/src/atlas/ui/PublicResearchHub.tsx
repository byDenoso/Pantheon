import {groupPublicVisuals} from '../publicVisualGroups.ts';
import {publicCount} from '../publicCount.ts';
import {useExplorerState} from './useExplorerState.ts';
import ArrowIcon from './ArrowIcon.tsx';
import {useEffect,useMemo,useState} from 'react';
import type {Locale} from '../api.ts';
import {pick,type PublicState} from '../publicItems.ts';
import {publicActivity,researchEntries,TOPICS,filterResearch,visualLinks,ACTIVITY_LABELS,STATE_LABELS,type ResearchEntry} from '../researchExplorer.ts';
import PublicVisualGallery from './PublicVisualGallery.tsx';
import PublicCampaignsView from './PublicCampaignsView.tsx';
import PublicTestList from './PublicTestList.tsx';
import ReadingSwitch from './ReadingSwitch.tsx';
import ReadingTour from './ReadingTour.tsx';
import Explained from './Explained.tsx';
import {useMessages} from './LocaleProvider.tsx';
import {useReadingMode} from './useReadingMode.ts';
import {SEARCH_EVENT} from './ResearchLaunch.tsx';
import TopicDistribution from '../../experience/TopicDistribution.tsx';

function HubIcon({tab}:{tab:string}) {
  const paths:Record<string,string>={updates:'M5 5h14M5 12h14M5 19h9',figures:'M4 4v16h16M7 15l4-5 4 3 5-7',map:'M6 6l12 3-6 10L6 6m0 0 6 13m6-10L6 6',compare:'M5 20V10h5v10m4 0V4h5v16',catalog:'M4 5h16v14H4zM4 10h16M9 10v9'};
  return <svg className="nexo-hub-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[tab]}/></svg>;
}

/** Kind of study and its state, from the published record only; never inferred from the text. */
function EntryTags({entry,locale}:{entry:ResearchEntry;locale:Locale}){
  return <span className="nexo-entry-tags">{entry.activity&&<span className="nexo-entry-tag">{pick(ACTIVITY_LABELS[entry.activity],locale)}</span>}<span className="nexo-entry-tag" data-state={entry.state}>{pick(STATE_LABELS[entry.state],locale)}</span></span>;
}

export function ResearchMap({entries,locale}:{entries:ResearchEntry[];locale:Locale}){
  const en=locale==='en',plainMode=useReadingMode()==='plain';
  const [topic,setTopic]=useExplorerState<string>('map.topic','all'),[query,setQuery]=useExplorerState<string>('map.query',''),[selected,setSelected]=useExplorerState<string>('map.selected',''),[page,setPage]=useExplorerState<number>('map.page',0);
  // The hero search field hands its query to this list.
  useEffect(()=>{const receive=(event:Event)=>{const value=(event as CustomEvent<string>).detail;if(typeof value!=='string')return;setQuery(value);setTopic('all');setPage(0);setSelected('');};window.addEventListener(SEARCH_EVENT,receive);return()=>window.removeEventListener(SEARCH_EVENT,receive);},[setQuery,setTopic,setPage,setSelected]);
  const searched=filterResearch(entries,{query,locale});
  const categories=[{id:'all',label:en?'All subjects':'Todos os assuntos'},...TOPICS.map(t=>({id:t.id,label:pick(t.label,locale)})),{id:'other',label:en?'Other questions':'Outras perguntas'}].map(c=>({...c,entries:searched.filter(e=>c.id==='all'||(c.id==='other'?e.topics.length===0:e.topics.includes(c.id as typeof e.topics[number])))})).filter(c=>c.entries.length);
  const category=categories.find(c=>c.id===topic)??categories[0];
  const filtered=category?.entries??[],pages=Math.max(1,Math.ceil(filtered.length/8)),current=Math.min(page,pages-1),visible=filtered.slice(current*8,(current+1)*8);
  const chosen=visible.find(e=>e.id===selected)??visible[0];
  const positions=[[24,22],[50,15],[76,22],[84,48],[76,75],[50,82],[24,75],[16,48]];
  const choose=(id:string)=>setSelected(id);
  return <div className="nexo-research-map">
    <p className="nexo-map-intro">{en?'Search a term or choose a subject, then open a question to read what was tested and what came out.':'Busque um termo ou escolha um assunto; depois abra uma pergunta para ler o que foi testado e o que saiu.'}</p>
    <div className="nexo-filter-row"><label>{en?'Find a question':'Buscar pergunta'}<input type="search" placeholder={en?'Question, method or result…':'Pergunta, método ou resultado…'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setSelected('');}}/></label>{query&&<button type="button" onClick={()=>{setQuery('');setPage(0);}}>{en?'Clear search':'Limpar busca'}</button>}</div>
    <div className="nexo-map-topics" role="group" aria-label={en?'Research subjects':'Assuntos da pesquisa'}>{categories.map(c=><button type="button" key={c.id} aria-pressed={category?.id===c.id} onClick={()=>{setTopic(c.id);setPage(0);setSelected('');}}><span>{c.id==='bao'?'BAO':c.id==='cmb'?'CMB':c.label}</span><strong>{c.entries.length}</strong></button>)}</div>
    <TopicDistribution entries={searched} locale={locale}/>
    {chosen&&category?<>
      <div className="nexo-map-stage nexo-map-v2">
        <div className="nexo-constellation" aria-label={en?'Select a question in this subject':'Selecione uma pergunta neste assunto'}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><ellipse cx="50" cy="50" rx="36" ry="38" className="nexo-orbit-ring"/>{visible.map((e,j)=>{const [x,y]=positions[j];return <path key={e.id} d={`M50 50 Q${50+(x-50)*.3} ${y} ${x} ${y}`} className={`nexo-orbit-link ${chosen.id===e.id?'is-selected':''}`}/>;})}</svg>
          <div className="nexo-orbit-center" aria-hidden="true"><strong>{category.entries.length}</strong><span>{en?(category.entries.length===1?'question':'questions'):(category.entries.length===1?'pergunta':'perguntas')}</span></div>
          {visible.map((e,j)=>{const [x,y]=positions[j],number=String(current*8+j+1).padStart(2,'0');return <button type="button" key={e.id} className="nexo-orbit-node" style={{left:`${x}%`,top:`${y}%`}} aria-label={`${number}. ${pick(e.question,locale)}`} aria-pressed={chosen.id===e.id} onClick={()=>choose(e.id)} title={pick(e.question,locale)}><span>{number}</span></button>;})}
          <span className="nexo-orbit-caption">{en?'Select a numbered question':'Selecione uma pergunta numerada'}</span>
        </div>
        <aside className="nexo-map-selected" aria-live="polite" aria-atomic="true"><p className="atlas-kind">{category.id==='all'?(chosen.topics.length?pick(TOPICS.find(t=>t.id===chosen.topics[0])!.label,locale):(en?'Other questions':'Outras perguntas')):category.label}</p><h4>{pick(chosen.question,locale)}</h4><EntryTags entry={chosen} locale={locale}/><p className="nexo-map-record-count">{chosen.tests} {en?'associated analyses':'análises associadas'}</p>{plainMode&&chosen.plain&&<p className="nexo-map-plain">{pick(chosen.plain,locale)}</p>}{chosen.summary&&(!plainMode||!chosen.plain)&&<Explained as="p" className="nexo-map-preview" text={pick(chosen.summary,locale)} locale={locale}/>}<a className="nexo-map-open" href={chosen.href}>{en?'Explore this question':'Explorar esta pergunta'} <ArrowIcon/></a></aside>
      </div>
      <ol className="nexo-map-index" start={current*8+1}>{visible.map((e,j)=><li key={e.id}><button type="button" aria-pressed={chosen.id===e.id} onClick={()=>choose(e.id)}><span className="nexo-map-list-number" aria-hidden="true">{String(current*8+j+1).padStart(2,'0')}</span><span>{pick(e.question,locale)}<EntryTags entry={e} locale={locale}/></span></button><a href={e.href} aria-label={`${en?'Open':'Abrir'}: ${pick(e.question,locale)}`}><ArrowIcon/></a></li>)}</ol>
      <div className="nexo-inline-pagination nexo-map-pagination"><span role="status">{current*8+1}–{Math.min((current+1)*8,filtered.length)} {en?'of':'de'} {filtered.length}</span>{pages>1&&<><button type="button" disabled={current===0} onClick={()=>{setPage(current-1);setSelected('');}}>{en?'Previous':'Anterior'}</button><button type="button" disabled={current+1>=pages} onClick={()=>{setPage(current+1);setSelected('');}}>{en?'Next':'Próxima'}</button></>}</div>
      <small className="nexo-map-disclosure">{en?'Connections indicate shared subjects, not scientific agreement. A question may appear in more than one subject.':'As conexões indicam assuntos em comum, sem implicar concordância científica. Uma pergunta pode aparecer em mais de um assunto.'}</small>
    </>:<div className="nexo-map-empty" role="status"><h4>{en?'No matching questions':'Nenhuma pergunta encontrada'}</h4><p>{en?'Try another term or clear the search to explore all subjects.':'Tente outro termo ou limpe a busca para explorar todos os assuntos.'}</p>{query&&<button type="button" onClick={()=>{setQuery('');setPage(0);setSelected('');}}>{en?'Show all questions':'Ver todas as perguntas'} <ArrowIcon direction="right"/></button>}</div>}
  </div>;
}

function ResultComparison({entries,locale}:{entries:ResearchEntry[];locale:Locale}){
  const en=locale==='en', [left,setLeft]=useExplorerState<string>('compare.left',entries[0]?.id??''),[right,setRight]=useExplorerState<string>('compare.right',entries[1]?.id??'');
  const a=entries.find(e=>e.id===left)??entries[0],b=entries.find(e=>e.id===right&&e.id!==a?.id)??entries.find(e=>e.id!==a?.id);
  if(entries.length<2)return <p>{en?'At least two published investigations are needed for comparison.':'A comparação exige pelo menos duas investigações publicadas.'}</p>;
  const unknown=en?'Not published yet.':'Ainda não publicado.';
  const rows=[
    {label:en?'Type of study':'Tipo de estudo',value:(e:ResearchEntry)=>e.topics.includes('software')?(en?'Software validation':'Validação de software'):e.activity?pick(ACTIVITY_LABELS[e.activity],locale):(en?'Published study':'Estudo publicado')},
    {label:en?'Method and scope':'Método e recorte',value:(e:ResearchEntry)=>e.method?pick(e.method,locale):unknown},
    {label:en?'Published result summary':'Síntese dos resultados publicados',value:(e:ResearchEntry)=>e.summary?pick(e.summary,locale):unknown},
    {label:en?'Limits':'Limites',value:(e:ResearchEntry)=>e.limits.length?e.limits.map(v=>pick(v,locale)).join('\n'):unknown},

  ];
  return <div className="nexo-comparison"><p>{en?'Read the methods, data selections and limits before interpreting differences between conclusions.':'Confira os métodos, recortes e limites antes de interpretar diferenças entre as conclusões.'}</p><div className="nexo-filter-row">{[{label:en?'First investigation':'Primeira investigação',selected:a?.id??'',other:b?.id,set:setLeft},{label:en?'Second investigation':'Segunda investigação',selected:b?.id??'',other:a?.id,set:setRight}].map((f,i)=><label key={i}>{f.label}<select value={f.selected} onChange={e=>f.set(e.target.value)}>{entries.map(e=><option key={e.id} value={e.id} disabled={e.id===f.other}>{pick(e.question,locale)}</option>)}</select></label>)}</div>{a&&b&&<div className="nexo-comparison-columns">{[a,b].map((e,i)=><article className="nexo-reading-card" key={e.id}><p className="atlas-kind">{en?`Investigation ${i+1}`:`Investigação ${i+1}`}</p><h4>{pick(e.question,locale)}</h4><dl>{rows.map(row=><div key={row.label}><dt>{row.label}</dt><dd><Explained text={row.value(e)} locale={locale}/></dd></div>)}</dl><a href={e.href}>{en?'Read the associated studies':'Ler os estudos associados'} <ArrowIcon/></a></article>)}</div>}</div>;
}

function FullCatalog({pub,locale}:{pub:PublicState;locale:Locale}){
  const m=useMessages(),en=locale==='en';
  return <div className="atlas-items" data-status={pub.status}>
    {pub.campaigns!==undefined&&pub.campaigns.length>0&&<PublicCampaignsView campaigns={pub.campaigns} locale={locale} generatedAt={pub.generatedAt} coverage={pub.coverage} visuals={pub.visuals}/>}
    {pub.campaigns?.length===0&&<p>{en?'The investigations are awaiting publication of an update.':'As investigações aguardam a publicação de uma atualização.'}</p>}
    {(pub.campaigns===undefined||pub.selection==='LIVE')&&pub.tests.length>0&&<h4>{en?'Published results':'Resultados publicados'}</h4>}
    {(pub.campaigns===undefined||pub.selection==='LIVE')&&pub.tests.length>0&&<PublicTestList tests={pub.tests} locale={locale} visuals={pub.visuals}/>}
    {pub.items.map(it=><article key={it.id} className="atlas-item">
      <span className="atlas-kind">{m.kinds[it.kind]}</span>
      <h4>{pick(it.title,locale)}</h4>
      <p>{pick(it.plain,locale)}</p>
      <details><summary>{m.technicalLabel}</summary><p>{pick(it.technical,locale)}</p></details>
      {it.credit&&<small>{m.creditLabel}: {it.credit}</small>}
    </article>)}
  </div>;
}

export default function PublicResearchHub({pub,locale,checking,pending,checkedAt,refresh,activeTab,onTabChange}:{pub:PublicState;locale:Locale;checking:boolean;pending:boolean;checkedAt:string|null;refresh:()=>void;activeTab?:string;onTabChange?:(tab:string)=>void}){
  const en=locale==='en',[localTab,setLocalTab]=useState('map'),tab=activeTab??localTab;
  const setTab=(value:string)=>{setLocalTab(value);onTabChange?.(value);};
  const entries=useMemo(()=>researchEntries(pub),[pub]),activity=useMemo(()=>publicActivity(pub,locale),[pub,locale]);
  const figureCount=useMemo(()=>pub.visuals===undefined?undefined:groupPublicVisuals(pub.visuals).length,[pub.visuals]);
  // One hub, five views. The hero shortcuts and the question list point here under the same names.
  const tabs=[['map',en?'Questions':'Perguntas'],['figures',en?'Figures and plots':'Figuras e gráficos'],['compare',en?'Compare results':'Comparar resultados'],['updates',en?'Latest updates':'Atualizações'],['catalog',en?'Full catalog':'Catálogo completo']];
  const dated=entries.flatMap(e=>e.updatedAt?[e.updatedAt]:[]).sort((a,b)=>Date.parse(b)-Date.parse(a));const published=pub.generatedAt??dated[0];
  const date=(d:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(d))+' (UTC−03:00)';
  return <div className="nexo-research-hub">
    <div className="nexo-research-pulse"><div><p className="atlas-eyebrow">{en?'Follow the research':'Acompanhe a pesquisa'}</p><p>{en?'Questions, public evidence and the next steps of each investigation.':'Perguntas, evidências públicas e os próximos passos de cada investigação.'}</p><ReadingSwitch locale={locale}/></div><dl className="nexo-research-counts"><div><dt>{en?'Questions':'Perguntas'}</dt><dd>{publicCount(pub,entries.length,en)}</dd></div><div><dt>{en?'Analyses':'Análises'}</dt><dd>{publicCount(pub,pub.campaigns!==undefined?pub.campaigns.reduce((n,c)=>n+c.tests.length,0)+(pub.selection==='LIVE'?pub.tests.length:0):pub.tests.length,en,true)}</dd></div><div><dt>{en?'Published figures':'Figuras publicadas'}</dt><dd>{publicCount(pub,figureCount,en)}</dd></div></dl></div>
    <div className="nexo-public-freshness"><div>{published&&<p>{pub.selection==='LIVE'?(en?'Latest site publication':'Última publicação no site'):(en?'Latest catalog update':'Última atualização do catálogo')}: <time dateTime={published}>{date(published)}</time></p>}<details className="nexo-update-details"><summary>{en?'Update details':'Detalhes da atualização'}</summary>{checkedAt&&<small>{en?'Last checked':'Última consulta'}: <time dateTime={checkedAt}>{date(checkedAt)}</time></small>}{pub.selection==='LIVE'&&<p>{en?'This date records the public selection. Each study keeps its original publication and update dates.':'Esta data registra a publicação da seleção pública. Cada estudo mantém suas datas originais de publicação e atualização.'}</p>}<p className="nexo-refresh-status" role="status">{pending?(en?'The update is pending. The last available version is still displayed.':'A atualização está pendente. A última versão disponível continua visível.'):(en?'New public updates are checked while this page is open.':'Novas atualizações públicas são consultadas enquanto a página está aberta.')}</p></details></div><button type="button" disabled={checking} onClick={refresh}>{checking?(en?'Checking…':'Consultando…'):(en?'Check for updates ↻':'Consultar atualização ↻')}</button></div>
    <ReadingTour locale={locale}/>
    <div className="nexo-hub-tabs" role="tablist" aria-label={en?'Explore public research':'Explorar a pesquisa pública'}>{tabs.map(([id,label])=><button key={id} type="button" role="tab" id={`research-tab-${id}`} aria-selected={tab===id} aria-controls={`research-panel-${id}`} tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const index=tabs.findIndex(t=>t[0]===id);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;setTab(tabs[next][0]);document.getElementById(`research-tab-${tabs[next][0]}`)?.focus();}}}><HubIcon tab={id}/><span>{label}</span></button>)}</div>
    <section key={tab} className="nexo-hub-panel" role="tabpanel" id={`research-panel-${tab}`} aria-labelledby={`research-tab-${tab}`} tabIndex={0}>
      {tab==='updates'&&<><h3>{en?'Latest public updates':'Últimas atualizações públicas'}</h3>{activity.length?<ol className="nexo-activity-list">{activity.map(e=><li key={e.key}><div><span className="atlas-kind">{e.label}</span><time dateTime={e.date}>{date(e.date)}</time></div><a href={e.href}>{e.title}<ArrowIcon/></a></li>)}</ol>:<p>{en?'No dated research updates are available yet.':'Ainda não há atualizações de pesquisa com data disponível.'}</p>}</>}
      {tab==='figures'&&<><h3>{en?'Figures and plots':'Figuras e gráficos'}</h3><PublicVisualGallery visuals={pub.visuals??[]} locale={locale} links={visualLinks(pub.visuals??[],pub)}/></>}
      {tab==='map'&&<><h3>{en?'Questions':'Perguntas'}</h3><ResearchMap entries={entries} locale={locale}/></>}
      {tab==='compare'&&<><h3>{en?'Compare published results':'Comparar resultados publicados'}</h3><ResultComparison key={entries.map(e=>e.id).join(':')} entries={entries} locale={locale}/></>}
      {tab==='catalog'&&<><h3>{en?'All published studies':'Todos os estudos publicados'}</h3><FullCatalog pub={pub} locale={locale}/></>}
    </section>
  </div>;
}
