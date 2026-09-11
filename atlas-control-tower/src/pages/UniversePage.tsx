import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DomainNavigator } from '../components/DomainNavigator/DomainNavigator';
import { buildDomainNavigatorModel } from '../components/DomainNavigator/domain-model.mjs';
import { loadUniverseSource } from '../data/load-universe';
import { buildUniverseView } from '../data/universes-model';

export default function UniversePage(){
 const {universeId=''}=useParams();
 const [searchParams]=useSearchParams();
 const selectedEntity=searchParams.get('entity')||'';
 const [graph,setGraph]=useState<any>(undefined);
 useEffect(()=>{let live=true;setGraph(undefined);void loadUniverseSource(universeId).then(value=>{if(live)setGraph(value)});return()=>{live=false}},[universeId]);
 const model=useMemo(()=>buildUniverseView(universeId,graph??null,selectedEntity),[universeId,graph,selectedEntity]);
 const domainModel=useMemo(()=>buildDomainNavigatorModel(universeId,graph??null),[universeId,graph]);
 const loading=graph===undefined;
 return <div className="nexo-page universe-page">
  <nav className="nexo-breadcrumb"><Link to="/universes">Universos</Link><span>/</span><b>{model.label}</b></nav>
  <PageHeader eyebrow="UNIVERSO" title={model.label} description={model.description}/>
  <div className="universe-source-row"><span className={`overview-source ${model.available?'ok':'offline'}`}><i/>{loading?'Carregando…':model.available?model.sourceLabel.toUpperCase():'Fonte indisponível'}</span></div>
  {!loading&&!model.available?<section className="nexo-empty-state"><h2>Universo indisponível</h2><p>A projeção não respondeu. Nenhuma estrutura foi sintetizada.</p></section>:null}
  {model.available?<>
   <section className="universe-section-head"><div><span className="panel-kicker">NAVEGAÇÃO</span><h2>Domínios</h2></div><span>{model.subdomains.length}</span></section>
   {model.subdomains.length?<DomainNavigator universeId={universeId} model={domainModel}/>:<section className="universe-inline-empty"><b>Nenhum subdomínio canônico publicado.</b><p>A interface mostra abaixo apenas as entidades que a projeção realmente declarou.</p></section>}
  </>:null}
  {model.available?<>
   <section className="universe-section-head entities-head"><div><span className="panel-kicker">RECORTE</span><h2>Entidades publicadas</h2></div><span>{model.entities.length}</span></section>
   {model.facets.length?<div className="facet-row">{model.facets.map(f=><span key={f.type}>{f.type} <b>{f.count}</b></span>)}</div>:null}
   {model.entities.length?<section className="entity-list-simple">{model.entities.map(item=><article className={item.id===selectedEntity?'search-target':''} key={item.id}>
    <div><span className="panel-kicker">{item.type}</span><h3>{item.label}</h3>{item.summary&&<p>{item.summary}</p>}</div><span className="status-pill">{item.status||'—'}</span>
   </article>)}</section>:<section className="universe-inline-empty"><b>Nenhuma entidade filha publicada.</b><p>O universo existe, mas o recorte atual não expõe filhos nesse nível.</p></section>}
  </>:null}
 </div>;
}
