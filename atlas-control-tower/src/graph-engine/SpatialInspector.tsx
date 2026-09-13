import {useMemo,useState} from 'react';
import type {AtlasActions,AtlasUiState} from '../state/useAtlasSession';
import type {GraphProjection} from './types';

type Tab='overview'|'relations'|'evidence'|'history'|'runs'|'artifacts'|'provenance';
const TABS:Tab[]=['overview','relations','evidence','history','runs','artifacts','provenance'];
const tabLabel:Record<Tab,string>={overview:'Overview',relations:'Relations',evidence:'Evidence',history:'History',runs:'Runs',artifacts:'Artifacts',provenance:'Provenance'};
const relationKind=(value:string)=>value.toUpperCase();
const evidenceRelation=(value:string)=>{const kind=relationKind(value);return kind.includes('EVIDENCE')||kind.includes('SUPPORT')||kind.includes('CONTRADICT')||kind.includes('TEST')||kind.includes('PRODUC')};

export function SpatialInspector({state,actions,projection,onOpen}:{state:AtlasUiState;actions:AtlasActions;projection:GraphProjection|null;onOpen:(id:string)=>void}){
  const [deep,setDeep]=useState(false);const [tab,setTab]=useState<Tab>('overview');
  const selected=projection?.nodes.find(node=>node.id===state.selectedId)||null;
  const relations=useMemo(()=>{
    if(!selected)return [];
    const canonical=state.selectedEntity?.relations;
    return canonical?.length?canonical:projection?.edges.filter(edge=>edge.source===selected.id||edge.target===selected.id)||[];
  },[projection,selected,state.selectedEntity]);
  const provenance=state.selectedEntity?.provenance||[];
  const compareNodes=state.compare.map(id=>projection?.nodes.find(node=>node.id===id)).filter(Boolean) as NonNullable<typeof selected>[];
  if(!selected&&!compareNodes.length)return null;
  const pinned=selected?state.pins.includes(selected.id):false;
  const compared=selected?state.compare.includes(selected.id):false;
  const neighbor=(id:string)=>projection?.nodes.find(node=>node.id===id)?.label||id;
  const relatedRows=relations.map((edge:any)=>({id:String(edge.id||`${edge.source}:${edge.type}:${edge.target}`),type:String(edge.type||edge.relation||'RELATED'),other:String(edge.source===selected?.id?edge.target:edge.source)}));
  const evidenceRows=relatedRows.filter(row=>evidenceRelation(row.type));
  const runRows=relatedRows.filter(row=>projection?.nodes.find(node=>node.id===row.other)?.type.toUpperCase()==='RUN');

  return <>
    {selected&&<aside className={`spatial-inspector ${deep?'is-deep':'is-quick'}`} aria-label="Inspector do nó selecionado">
      <div className="spatial-inspector-head"><div><span>{selected.contextRole==='portal'?'PORTAL · ':''}{selected.type}</span><h3>{selected.label}</h3></div><button onClick={actions.clearSelection} aria-label="Fechar inspector">×</button></div>
      {!deep?<div className="spatial-inspector-quick">
        <p>{selected.summary||'Sem resumo publicado.'}</p>
        <dl><div><dt>Status</dt><dd>{selected.status||'—'}</dd></div><div><dt>Freshness</dt><dd>{selected.freshness||state.summary?.projection?.freshness||'—'}</dd></div><div><dt>Relações</dt><dd>{relations.length}</dd></div></dl>
        <div className="spatial-inspector-actions">{selected.id!==projection?.focusId&&<button className="primary" onClick={()=>onOpen(selected.id)}>{selected.contextRole==='portal'?'Atravessar portal':'Entrar'}</button>}<button onClick={()=>pinned?actions.unpin(selected.id):actions.pin(selected.id)}>{pinned?'Unpin':'Pin'}</button><button className={compared?'active':''} onClick={()=>actions.toggleCompare(selected.id)}>Compare</button><button onClick={()=>setDeep(true)}>Deep inspector</button></div>
      </div>:<div className="spatial-inspector-deep">
        <nav>{TABS.map(value=><button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{tabLabel[value]}</button>)}</nav>
        <div className="spatial-inspector-tab">
          {tab==='overview'&&<><p>{selected.summary||'Sem descrição publicada.'}</p><dl><div><dt>ID</dt><dd>{selected.id}</dd></div><div><dt>Tipo</dt><dd>{selected.type}</dd></div><div><dt>Status</dt><dd>{selected.status||'—'}</dd></div><div><dt>Domínio</dt><dd>{selected.domain||'—'}</dd></div><div><dt>Atualizado</dt><dd>{selected.updatedAt||'—'}</dd></div>{Object.entries(selected.metrics||{}).filter(([key])=>key!=='compare').map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value??'—')}</dd></div>)}</dl></>}
          {tab==='relations'&&<RelationList rows={relatedRows} label={neighbor}/>} 
          {tab==='evidence'&&<RelationList rows={evidenceRows} label={neighbor} empty="Nenhuma relação de evidência publicada neste recorte."/>}
          {tab==='runs'&&<RelationList rows={runRows} label={neighbor} empty="Nenhuma Run relacionada publicada neste recorte."/>}
          {tab==='history'&&<dl><div><dt>Freshness</dt><dd>{selected.freshness||state.summary?.projection?.freshness||'—'}</dd></div><div><dt>Updated at</dt><dd>{selected.updatedAt||'—'}</dd></div><div><dt>Source version</dt><dd>{state.summary?.projection?.sourceVersion||'—'}</dd></div></dl>}
          {tab==='artifacts'&&<>{provenance.filter(item=>item.url).length?<ul className="spatial-source-list">{provenance.filter(item=>item.url).map((item,index)=><li key={`${item.url}:${index}`}><a href={item.url} target="_blank" rel="noreferrer">{item.label||item.sourceRef||item.source||'Abrir fonte'}</a></li>)}</ul>:<p>Nenhum artefato navegável publicado para esta entidade.</p>}</>}
          {tab==='provenance'&&<>{provenance.length?<ul className="spatial-source-list">{provenance.map((item,index)=><li key={`${item.sourceRef||item.source||'source'}:${index}`}><b>{item.label||item.source||'Fonte'}</b><span>{item.sourceRef||item.sourceId||'—'}</span><small>{item.observedAt||'sem timestamp publicado'}</small></li>)}</ul>:<p>Provenance detalhada não foi publicada neste read.</p>}</>}
        </div>
        <div className="spatial-inspector-actions"><button onClick={()=>setDeep(false)}>Quick inspector</button>{selected.id!==projection?.focusId&&<button className="primary" onClick={()=>onOpen(selected.id)}>Entrar</button>}</div>
      </div>}
    </aside>}
    {compareNodes.length===2&&<section className="spatial-compare" aria-label="Comparação de nós"><header><span>COMPARE</span><button onClick={()=>{actions.toggleCompare(compareNodes[0].id);actions.toggleCompare(compareNodes[1].id)}}>×</button></header><div>{compareNodes.map(node=><article key={node.id}><span>{node.type}</span><h4>{node.label}</h4><dl><div><dt>Status</dt><dd>{node.status||'—'}</dd></div><div><dt>Freshness</dt><dd>{node.freshness||'—'}</dd></div><div><dt>Domínio</dt><dd>{node.domain||'—'}</dd></div><div><dt>Relações visíveis</dt><dd>{projection?.edges.filter(edge=>edge.source===node.id||edge.target===node.id).length||0}</dd></div></dl></article>)}</div></section>}
  </>;
}

function RelationList({rows,label,empty='Nenhuma relação publicada neste recorte.'}:{rows:Array<{id:string;type:string;other:string}>;label:(id:string)=>string;empty?:string}){
  if(!rows.length)return <p>{empty}</p>;
  return <ul className="spatial-relation-list">{rows.slice(0,24).map(row=><li key={row.id}><b>{row.type}</b><span>{label(row.other)}</span><small>{row.other}</small></li>)}</ul>;
}
