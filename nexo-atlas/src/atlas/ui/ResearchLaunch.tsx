import {publicCount} from '../publicCount.ts';
import ArrowIcon from './ArrowIcon.tsx';
import {useMemo,useState} from 'react';
import type {Locale} from '../api.ts';
import type {PublicState} from '../publicItems.ts';
import {researchEntries} from '../researchExplorer.ts';

/** Fired with the typed query; the question list listens and filters itself. */
export const SEARCH_EVENT='nexo:search';
// Keep the latest request until the map is mounted; no query is persisted.
let pendingSearch:string|null=null;
export function takePendingSearch(){const value=pendingSearch;pendingSearch=null;return value;}

export default function ResearchLaunch({pub,locale,explore}:{pub:PublicState;locale:Locale;explore:(tab:string)=>void}) {
  const en=locale==='en',entries=useMemo(()=>researchEntries(pub),[pub]);
  const [query,setQuery]=useState('');
  const records=pub.campaigns!==undefined?pub.campaigns.reduce((n,c)=>n+c.tests.length,0)+(pub.selection==='LIVE'?pub.tests.length:0):pub.tests.length;
  // The three shortcuts carry the same names as the hub tabs they open.
  const links=[{id:'map',title:en?'Questions':'Perguntas',body:en?'Search, filter and open each result':'Busque, filtre e abra cada resultado',icon:'map'}, {id:'figures',title:en?'Figures and plots':'Figuras e gráficos',body:en?'Read the published values':'Leia os valores publicados',icon:'plot'}, {id:'updates',title:en?'Latest updates':'Atualizações',body:en?'What was published most recently':'O que foi publicado mais recentemente',icon:'updates'}];
  const search=(event:React.FormEvent)=>{event.preventDefault();pendingSearch=query.trim();window.dispatchEvent(new CustomEvent(SEARCH_EVENT,{detail:pendingSearch}));explore('map');};
  return <div className="nexo-research-launch">
    <div className="nexo-launch-records"><p className="atlas-eyebrow">{en?'Public research':'Pesquisa pública'}</p>{pub.status==='ready'?<p><strong>{publicCount(pub,entries.length,en)}</strong> {en?'questions':'perguntas'}<span aria-hidden="true"> / </span><strong>{publicCount(pub,records,en,true)}</strong> {en?'analyses':'análises'}</p>:<p>{pub.status==='loading'?(en?'Loading the public catalog…':'Carregando o catálogo público…'):(en?'Open the research catalog':'Abra o catálogo de pesquisa')}</p>}</div>
    <div>
      <form className="nexo-launch-search" role="search" onSubmit={search}>
        <label htmlFor="nexo-launch-query">{en?'Find a question':'Buscar uma pergunta'}<input id="nexo-launch-query" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={en?'dark energy, supernovae, BAO…':'energia escura, supernovas, BAO…'} autoComplete="off"/></label>
        <button type="submit" className="atlas-btn">{en?'Search':'Buscar'}<ArrowIcon direction="right"/></button>
      </form>
      <div className="nexo-launch-links">{links.map(link=><button className="nexo-research-shortcut" type="button" key={link.id} onClick={()=>explore(link.id)}>
        <svg viewBox="0 0 48 48" aria-hidden="true">{link.icon==='map'?<><path pathLength={1} d="M10 31 24 12 38 29M10 31 38 29M24 12 24 38"/><circle pathLength={1} cx="10" cy="31" r="4"/><circle pathLength={1} cx="24" cy="12" r="4"/><circle pathLength={1} cx="38" cy="29" r="4"/><circle pathLength={1} cx="24" cy="38" r="3"/></>:link.icon==='plot'?<><path pathLength={1} d="M8 9v30h32M14 29l8-12 8 8 9-15"/><circle pathLength={1} cx="22" cy="17" r="3"/><circle pathLength={1} cx="30" cy="25" r="3"/></>:<><path pathLength={1} d="M10 12h28M10 24h28M10 36h18"/><circle pathLength={1} cx="38" cy="36" r="4"/></>}</svg>
        <span><strong>{link.title}</strong><small>{link.body}</small></span><span className="nexo-shortcut-arrow"><ArrowIcon/></span>
      </button>)}</div>
    </div>
  </div>;
}
