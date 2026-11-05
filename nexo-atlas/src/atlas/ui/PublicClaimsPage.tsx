import {useEffect,useMemo,useState} from 'react';
import type {Locale} from '../api.ts';
import {pick,type PublicState} from '../publicItems.ts';
import {claimsFromPublic,currentVerifiedClaims,PUBLIC_SOURCE_URL,type PublicClaim} from '../researchRegistry.ts';
import Shell from './Shell.tsx';
import '../research-registry.css';

export default function PublicClaimsPage({pub,locale,refresh,pending}:{pub:PublicState;locale:Locale;refresh:()=>void;pending:boolean}) {
 const en=locale==='en';
 const evidence=(level:string|null|undefined)=>({unclassified:en?'Unclassified':'Não classificado',exploratory:en?'Exploratory':'Exploratório',replicated:en?'Replicated':'Reproduzido','peer-reviewed':en?'Peer-reviewed':'Revisado por pares'}[level??'']??(en?'Not classified in the public source.':'Não classificado na fonte pública.'));
 const [verified,setVerified]=useState<{source:PublicState;rows:PublicClaim[]}|null>(null),[failed,setFailed]=useState(false),[query,setQuery]=useState(''),[shown,setShown]=useState(12);
 const claims=currentVerifiedClaims(verified,pub,pending);
 useEffect(()=>{const controller=new AbortController();setVerified(null);setFailed(false);if(pub.status==='ready'&&!pending)claimsFromPublic(pub,controller.signal).then(rows=>{if(!controller.signal.aborted)setVerified({source:pub,rows});}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});return()=>controller.abort();},[pub,pending]);
 useEffect(()=>{document.title=en?'Public statements · NEXO':'Alegações públicas · NEXO';},[en]);
 const list=useMemo(()=>{const q=query.trim().toLocaleLowerCase(locale);return (claims??[]).filter(c=>!q||[c.test.question,c.test.result,c.test.answers].some(v=>pick(v,locale).toLocaleLowerCase(locale).includes(q)));},[claims,query,locale]);
 return <Shell area="public"><main className="atlas-main atlas-public-main nexo-claims" id="public-content" tabIndex={-1}>
  <nav className="nexo-study-breadcrumb" aria-label={en?'Breadcrumb':'Caminho de navegação'}><a href="/#/">{en?'Back to research':'Voltar à pesquisa'}</a><span aria-hidden="true">/</span><span aria-current="page">{en?'Public statements':'Alegações públicas'}</span></nav>
  <header><p className="atlas-eyebrow">NEXO · {en?'RESEARCH RECORD':'REGISTRO DE PESQUISA'}</p><h1>{en?'Public statements':'Alegações públicas'}</h1><p>{en?'Statements shown here are the exact result text in the current public selection, matched to a versioned public repository artifact. They are not independent confirmation or a scientific evidence grade. Public updates without this repository match remain available in the catalog, but are not listed here.':'As alegações abaixo reproduzem o resultado da seleção pública atual quando há correspondência exata com um artefato versionado no repositório. Essa correspondência não comprova confirmação independente nem classifica a evidência científica. Atualizações públicas sem essa correspondência continuam no catálogo, mas não são listadas aqui.'}</p></header>
  {pub.status==='loading'&&<p role="status">{en?'Loading the public catalog…':'Carregando o catálogo público…'}</p>}
  {pub.status==='unavailable'&&<div role="alert"><p>{en?'Public catalog unavailable.':'Catálogo público indisponível.'}</p><button type="button" onClick={refresh}>{en?'Try again':'Tentar novamente'}</button></div>}
  {pub.status==='empty'&&<p>{en?'There are no selected public records.':'Não há registros públicos selecionados.'}</p>}
  {pending&&<div role="alert"><p>{en?'The current public selection could not be checked; statements are withheld until it is available.':'Não foi possível conferir a seleção pública atual; as alegações ficam ocultas até a verificação.'}</p><button type="button" onClick={refresh}>{en?'Try again':'Tentar novamente'}</button></div>}
  {failed&&<p role="alert">{en?'Could not verify the public-source fingerprints.':'Não foi possível verificar as impressões digitais das fontes públicas.'}</p>}
  {pub.status==='ready'&&!pending&&!failed&&!claims&&<p role="status">{en?'Checking the source of each statement…':'Conferindo a fonte de cada alegação…'}</p>}
  {!pending&&claims&&<><label className="nexo-claims-search">{en?'Search statements':'Buscar alegações'}<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setShown(12);}}/></label><p role="status">{en?`${list.length} sourced statements`:`${list.length} alegações com fonte`}</p>
   {list.length===0?<p>{en?'No sourced statements match this selection.':'Nenhuma alegação com fonte corresponde a esta seleção.'}</p>:<ol className="nexo-claim-list">{list.slice(0,shown).map(c=><li key={`${c.group.id}:${c.test.id}`}><article><h2><a href={c.href}>{pick(c.test.question,locale)}</a></h2><p className="nexo-claim-result">{pick(c.test.result,locale)}</p><p><strong>{en?'Scope and limits: ':'Escopo e limites: '}</strong>{pick(c.test.answers,locale)}</p><p><strong>{en?'Evidence level: ':'Nível de evidência: '}</strong>{evidence(c.revision?.evidenceLevel)}</p><a href={PUBLIC_SOURCE_URL} target="_blank" rel="noreferrer">{en?'View versioned public source':'Ver fonte pública versionada'}</a></article></li>)}</ol>}
   {shown<list.length&&<button className="atlas-btn" type="button" onClick={()=>setShown(n=>n+12)}>{en?'Show more':'Mostrar mais'}</button>}</>}
 </main></Shell>;
}
