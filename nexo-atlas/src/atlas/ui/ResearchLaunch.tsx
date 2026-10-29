import {publicCount} from '../publicCount.ts';
import ArrowIcon from './ArrowIcon.tsx';
import {useMemo} from 'react';
import type {Locale} from '../api.ts';
import type {PublicState} from '../publicItems.ts';
import {researchEntries} from '../researchExplorer.ts';

export default function ResearchLaunch({pub,locale,explore}:{pub:PublicState;locale:Locale;explore:(tab:string)=>void}) {
  const en=locale==='en',entries=useMemo(()=>researchEntries(pub),[pub]);
  const records=pub.campaigns!==undefined?pub.campaigns.reduce((n,c)=>n+c.tests.length,0):pub.tests.length;
  const links=[{id:'map',title:en?'Explore questions':'Explore as perguntas',body:en?'Follow the connections':'Navegue pelas conexões',icon:'map'}, {id:'figures',title:en?'See the figures':'Veja as figuras',body:en?'Read the published values':'Leia os valores publicados',icon:'plot'}, {id:'compare',title:en?'Compare studies':'Compare os estudos',body:en?'Methods, results and limits':'Métodos, resultados e limites',icon:'compare'}];
  return <div className="nexo-research-launch">
    <div className="nexo-launch-records"><p className="atlas-eyebrow">{en?'Public research':'Pesquisa pública'}</p>{pub.status==='ready'?<p><strong>{publicCount(pub,entries.length,en)}</strong> {en?'questions':'perguntas'}<span aria-hidden="true"> / </span><strong>{publicCount(pub,records,en,true)}</strong> {en?'analyses':'análises'}</p>:<p>{pub.status==='loading'?(en?'Loading the public catalog…':'Carregando o catálogo público…'):(en?'Open the research catalog':'Abra o catálogo de pesquisa')}</p>}</div>
    <div className="nexo-launch-links">{links.map(link=><button className="nexo-research-shortcut" type="button" key={link.id} onClick={()=>explore(link.id)}>
      <svg viewBox="0 0 48 48" aria-hidden="true">{link.icon==='map'?<><path d="M10 31 24 12 38 29M10 31 38 29M24 12 24 38"/><circle cx="10" cy="31" r="4"/><circle cx="24" cy="12" r="4"/><circle cx="38" cy="29" r="4"/><circle cx="24" cy="38" r="3"/></>:link.icon==='plot'?<><path d="M8 9v30h32M14 29l8-12 8 8 9-15"/><circle cx="22" cy="17" r="3"/><circle cx="30" cy="25" r="3"/></>:<><path d="M10 14h11v24H10zM28 9h11v29H28zM17 7h14M28 4l4 3-4 3"/></>}</svg>
      <span><strong>{link.title}</strong><small>{link.body}</small></span><span className="nexo-shortcut-arrow"><ArrowIcon/></span>
    </button>)}</div>
  </div>;
}
