import {useState} from 'react';
import type {Locale} from '../api.ts';
import {pick} from '../publicItems.ts';
import {comparisonCsv,comparisonProvenance,type VisualGroup,type VisualLink} from '../publicVisualGroups.ts';
import InteractivePlot from './InteractivePlot.tsx';
import ArrowIcon from './ArrowIcon.tsx';
import {citableSources} from '../visualSources.ts';
import {presentLabel} from '../presentNumbers.ts';

export default function ComparisonFigure({group,locale,links,headingLevel}:{group:VisualGroup;locale:Locale;links:Record<string,VisualLink>;headingLevel:3|4}){
 const en=locale==='en',Heading=headingLevel===3?'h3':'h4';
 const [wide,setWide]=useState(()=>typeof matchMedia!=='function'||matchMedia('(min-width: 601px)').matches);
 const metadata=comparisonProvenance(group,links);
 return <article className="nexo-visual-card nexo-comparison-card" data-comparison={group.id}>
  <p className="atlas-kind">{en?'Published-value comparison':'Comparação dos valores publicados'} · {group.members.length} {en?'analyses':'análises'}</p>
  <Heading>{pick(group.title,locale)}</Heading>
  {/* The qualification is required reading, so it stays one tap away on a phone and open on wide screens. */}
  <details className="nexo-comparison-howto" open={wide} onToggle={event=>setWide(event.currentTarget.open)}><summary>{en?'How to read this comparison':'Como ler esta comparação'}</summary><p className="nexo-comparison-qualification">{pick(group.caption!,locale)}</p></details>
  <InteractivePlot plot={group.plot!} title={pick(group.title,locale)} locale={locale} comparison pointContext={(seriesId,pointIndex)=>{const visual=group.members.find(member=>member.id===seriesId),sourcePoint=visual?.plot?.series[0]?.points[pointIndex];return visual?{configuration:group.configurations[seriesId],sources:[...(links[seriesId]?[{label:{'pt-BR':'Ler a investigação de origem',en:'Read the source investigation'},url:links[seriesId].href}]:[]),...citableSources(visual.sources)],...(sourcePoint&&visual.plot?{originalX:{...visual.plot.x,value:sourcePoint.x}}:{})}:undefined;}} exportContext={{csv:comparisonCsv(group,locale,links),metadata,description:pick(group.caption!,locale),filename:`nexo-${group.id}`,notes:[pick(group.title,locale),en?'Full category key; the chart reflects the selected view.':'Chave completa de categorias; o gráfico reflete a visão selecionada.',...group.members.map((v,i)=>`${i+1}. ${pick(group.configurations[v.id],locale)}`),pick(group.caption!,locale),...group.members.map((v,i)=>`${i+1}. ${en?'Source':'Fonte'}: ${links[v.id]?links[v.id].href:v.sources.map(s=>s.url).join(' · ')}`)]}}/>
  <details className="nexo-comparison-sources">
   <summary>{en?'Sources, questions and limits for each analysis':'Fontes, perguntas e limites de cada análise'} ({group.members.length})</summary>
   <ol>{group.members.map(v=><li key={v.id}><details>
    <summary>{presentLabel(pick(group.configurations[v.id],locale),locale)}</summary>
    {v.subject.kind==='legacy-test'&&<><p><strong>{en?'Question: ':'Pergunta: '}</strong>{pick(v.subject.question,locale)}</p><p><strong>{en?'Method: ':'Método: '}</strong>{pick(v.subject.method,locale)}</p><p><strong>{en?'Scope: ':'Alcance: '}</strong>{pick(v.subject.answers,locale)}</p><p><strong>{en?'Result: ':'Resultado: '}</strong>{pick(v.subject.result,locale)}</p></>}
    <p><strong>{en?'Original caption: ':'Legenda original: '}</strong>{pick(v.caption,locale)}</p>
    <ul>{v.limitations.map((l,i)=><li key={i}>{pick(l,locale)}</li>)}</ul>
    <small>{en?'Published on':'Publicado em'} <time dateTime={v.publishedAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(new Date(v.publishedAt))}</time></small>
    <ul className="nexo-figure-sources">
     {links[v.id]&&<li><a href={links[v.id].href}>{en?'Read the source investigation':'Ler a investigação de origem'} <ArrowIcon/></a></li>}
     {citableSources(v.sources).map((source,i)=><li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{pick(source.label,locale)} <ArrowIcon/></a></li>)}
    </ul>
   </details></li>)}</ol>
  </details>
 </article>;
}
