import {useExplorerState} from './useExplorerState.ts';
import ArrowIcon from './ArrowIcon.tsx';
import {useMemo,useRef,useState} from 'react';
import type {Locale} from '../api.ts';
import {pick,type Bilingual} from '../publicItems.ts';
import {groupPublicVisuals,filterVisualGroups,visualAnalysisCount,visualMatches} from '../publicVisualGroups.ts';
import ComparisonFigure from './ComparisonFigure.tsx';
import type {PublicVisual} from '../publicVisuals.ts';
import InteractivePlot from './InteractivePlot.tsx';
export default function PublicVisualGallery({visuals,locale,compact=false,links={},headingLevel=4}:{visuals:PublicVisual[];locale:Locale;compact?:boolean;headingLevel?:3|4;links?:Record<string,{question:Bilingual;href:string}>}){
  const Heading=headingLevel===3?'h3':'h4';
  const en=locale==='en',dialog=useRef<HTMLDialogElement>(null),[expanded,setExpanded]=useState<PublicVisual|null>(null),[failed,setFailed]=useState<string[]>([]);
  const [query,setQuery]=useExplorerState<string>('figures.query','',!compact),[kind,setKind]=useExplorerState<string>('figures.kind','',!compact);
  const [page,setPage]=useExplorerState<number>('figures.page',0,!compact),gallery=useRef<HTMLDivElement>(null);
  const changePage=(next:number)=>{setPage(next);requestAnimationFrame(()=>{gallery.current?.scrollIntoView({block:'start',behavior:'instant'});gallery.current?.focus({preventScroll:true});});};
  const groups=useMemo(()=>groupPublicVisuals(visuals,compact),[visuals,compact]);
  const filtered=filterVisualGroups(groups,query,kind,locale),included=filtered.flatMap(g=>g.members);
  const matches=included.filter(v=>visualMatches(v,query,locale,filtered.find(g=>g.members.includes(v))?.configurations[v.id]));
  const pages=Math.max(1,Math.ceil(filtered.length/6)),current=Math.min(page,pages-1),shown=filtered.slice(current*6,(current+1)*6);
  return <div className="nexo-visual-gallery" ref={gallery} tabIndex={-1}>
    {!compact&&<><p>{en?'Comparable published analyses share a figure, with every configuration and source retained. Other results remain separate. Counts refer to figures and source analyses, not independent findings.':'Análises publicadas comparáveis compartilham uma figura, preservando cada configuração e fonte. Os demais resultados ficam separados. As contagens indicam figuras e análises de origem, não achados independentes.'}</p>{visuals.length>0&&<div className="nexo-filter-row"><label>{en?'Find a figure':'Buscar figura'}<input type="search" placeholder={en?'Question, figure or dataset…':'Pergunta, figura ou conjunto de dados…'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><label>{en?'Evidence type':'Tipo de evidência'}<select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="">{en?'All':'Todos'}</option><option value="SCIENTIFIC_RESULT">{en?'Scientific results':'Resultados científicos'}</option></select></label></div>}</>}
    {!visuals.length&&<div className="nexo-gallery-empty"><svg viewBox="0 0 160 72" aria-hidden="true"><path d="M8 8v54h144M22 46l30-14 26 10 30-26 30 8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 7"/><circle cx="108" cy="16" r="4" fill="currentColor"/></svg><h4>{en?'Figures awaiting publication':'Figuras aguardando publicação'}</h4><p>{en?'No figures or data series have been published yet. Published study summaries remain available below.':'Ainda não há figuras ou séries de dados publicadas. Os resumos dos estudos publicados continuam disponíveis.'}</p></div>}
    {visuals.length>0&&!filtered.length&&<div className="nexo-gallery-empty nexo-filter-empty"><h4>{en?'No matching figures':'Nenhuma figura encontrada'}</h4><p>{en?'No figure matches these filters.':'Nenhuma figura corresponde a estes filtros.'}</p><button type="button" onClick={()=>{setQuery('');setKind('');setPage(0);}}>{en?'Clear filters':'Limpar filtros'} <ArrowIcon direction="right"/></button></div>}
    {visuals.length>0&&<p className="nexo-gallery-count" role="status">{filtered.length ? `${current*6+1}–${Math.min((current+1)*6,filtered.length)} / ${filtered.length}` : '0'} {en?'figures':'figuras'} · {visualAnalysisCount(included)} {en?'source analyses':'análises de origem'}{query.trim()&&filtered.length>0&&<> · {visualAnalysisCount(matches)} {en?'matching analyses; full comparisons retained':'análises correspondem à busca; comparações completas preservadas'}</>}</p>}
    <div className={`nexo-gallery-grid${compact?' is-compact':''}`}>
    {shown.map(group=>group.plot?<ComparisonFigure key={group.id} group={group} locale={locale} links={links} headingLevel={headingLevel}/>:group.members.map(v=><article className="nexo-visual-card" key={v.id}>
      <p className="atlas-kind">{v.presentation==='PUBLISHED_SUMMARY'?(en?'Published-value summary':'Síntese dos valores publicados'):(v.evidenceKind==='SCIENTIFIC_RESULT'?(en?'Reviewed scientific result':'Resultado científico revisado'):(en?'Software validation':'Validação de software'))}</p><Heading>{pick(v.title,locale)}</Heading>
      {!compact&&links[v.id]&&<details className="nexo-figure-question"><summary>{en?'Question and context':'Pergunta e contexto'}</summary><p><a href={links[v.id].href}>{en?'Test question':'Pergunta do teste'}: {pick(links[v.id].question,locale)} <ArrowIcon/></a></p></details>}
      {v.image&&!failed.includes(v.id)&&<button type="button" className="nexo-figure-open" aria-label={`${en?'Enlarge':'Ampliar'}: ${pick(v.title,locale)}`} onClick={()=>{setExpanded(v);dialog.current?.showModal();}}><img src={v.image.path} alt={pick(v.image.alt,locale)} width={v.image.width} height={v.image.height} loading="lazy" decoding="async" onError={()=>setFailed(old=>[...old,v.id])}/><span>{en?'Enlarge figure ↗':'Ampliar figura ↗'}</span></button>}
      {failed.includes(v.id)&&<p>{en?'The published image could not be loaded. Its caption and references remain available.':'A imagem publicada não pôde ser carregada. A legenda e as referências continuam disponíveis.'}</p>}
      {v.plot&&<InteractivePlot key={`${v.id}:${locale}`} plot={v.plot} title={pick(v.title,locale)} locale={locale}/>}
      <p>{pick(v.caption,locale)}</p>{v.limitations.length>0&&<details className="nexo-result-limits nexo-figure-limits"><summary>{en?'Limits of this result':'Limites deste resultado'}</summary><ul>{v.limitations.map((b,i)=><li key={i}>{pick(b,locale)}</li>)}</ul></details>}
      <small>{en?'Published on':'Publicado em'} <time dateTime={v.publishedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(new Date(v.publishedAt))}</time></small>
      <ul className="nexo-figure-sources">{v.sources.map((s,i)=><li key={i}><a href={v.presentation==='PUBLISHED_SUMMARY'&&links[v.id]?links[v.id].href:s.url} target={v.presentation==='PUBLISHED_SUMMARY'&&links[v.id]?undefined:'_blank'} rel="noopener noreferrer">{v.presentation==='PUBLISHED_SUMMARY'&&links[v.id]?(en?'Read the source investigation':'Ler a investigação de origem'):pick(s.label,locale)} <ArrowIcon/></a></li>)}</ul>
      {v.image&&<a href={v.image.path} download>{en?'Download published image':'Baixar imagem publicada'}</a>}
    </article>))}
    </div>
    {pages>1&&<nav className="nexo-inline-pagination" aria-label={en?'Figure pages':'Páginas de figuras'}><button type="button" disabled={current===0} onClick={()=>changePage(current-1)}>{en?'Previous':'Anterior'}</button><span>{current+1} / {pages}</span><button type="button" disabled={current+1>=pages} onClick={()=>changePage(current+1)}>{en?'Next':'Próxima'}</button></nav>}
    <dialog ref={dialog} className="nexo-figure-dialog" aria-label={expanded?pick(expanded.title,locale):(en?'Published figure':'Figura publicada')} onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}} onClose={()=>setExpanded(null)}><button type="button" className="atlas-btn" autoFocus onClick={()=>dialog.current?.close()}>{en?'Close figure':'Fechar figura'} ×</button>{expanded?.image&&<><h3>{pick(expanded.title,locale)}</h3><img src={expanded.image.path} alt={pick(expanded.image.alt,locale)}/><p>{pick(expanded.caption,locale)}</p></>}</dialog>
  </div>;
}
