import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CanvasGraph25D,type CanvasEdge25D,type CanvasGraph25DHandle,type CanvasNode25D} from '../components/CanvasGraph25D.tsx';

type NodeKind='ROOT'|'LAYER'|'TRANSPORT'|'TOOL'|'FAMILY'|'CAPABILITY'|'BACKEND'|'ROLE';
type TopologyNode={
  id:string;label:string;kind:NodeKind;group:string;status:string;summary?:string;
  meta?:Record<string,unknown>;
};
type TopologyLink={id:string;source:string|TopologyNode;target:string|TopologyNode;kind:string;weight:number};
type Topology={
  contract:string;generated_at:string;
  source:{authority:string;repository:string;commit:string;manifest:string;mcp_server:string;remote_mcp:string;source_storage?:string;source_snapshot_id?:string;source_state_fingerprint?:string;source_promoted_at?:string;projection_fingerprint?:string};
  stats:{tools:number;remote_tools:number;internal_tools:number;capabilities:number;backends:number;roles:number;families:number;status_counts:Record<string,number>;backend_counts:Record<string,number>};
  nodes:TopologyNode[];links:TopologyLink[];
};

// One coherent cyan/blue galaxy identity: node kind is read from radial position
// and label, not from hue. Brightness alone separates the structural core from
// leaf nodes so the map never reads as a rainbow dashboard.
const COLORS:Record<NodeKind,string>={
  ROOT:'#eafcff',LAYER:'#9fe9ff',TRANSPORT:'#8fdcf7',TOOL:'#79e7ff',
  FAMILY:'#6fc3e8',CAPABILITY:'#79e7ff',BACKEND:'#8fdcf7',ROLE:'#5fa7c4',
};
const endpoint=()=>new URL('./topology.json',window.location.href).toString();
const idOf=(value:string|TopologyNode)=>typeof value==='string'?value:value.id;

function kindLabel(kind:NodeKind){
  return ({ROOT:'MCP',LAYER:'CAMADA',TRANSPORT:'TRANSPORTE',TOOL:'TOOL',FAMILY:'FAMÍLIA',CAPABILITY:'CAPABILITY',BACKEND:'RUNTIME',ROLE:'ROLE'} as Record<NodeKind,string>)[kind];
}
function hash32(value:string){
  let hash=2166136261;
  for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function topologyLayout(nodes:TopologyNode[]):CanvasNode25D[]{
  const radiusByKind:Record<NodeKind,number>={
    ROOT:0,LAYER:72,TRANSPORT:96,FAMILY:150,BACKEND:166,ROLE:178,TOOL:235,CAPABILITY:252,
  };
  const nodeRadius:Record<NodeKind,number>={
    ROOT:2.9,LAYER:1.8,TRANSPORT:1.55,FAMILY:1.45,BACKEND:1.38,ROLE:1.28,TOOL:.78,CAPABILITY:.88,
  };
  const buckets=new Map<NodeKind,TopologyNode[]>();
  for(const node of nodes){
    const group=buckets.get(node.kind)??[];
    group.push(node);buckets.set(node.kind,group);
  }
  const result:CanvasNode25D[]=[];
  for(const [kind,group] of buckets){
    const ordered=[...group].sort((a,b)=>a.id.localeCompare(b.id));
    ordered.forEach((node,index)=>{
      if(kind==='ROOT'){
        result.push({id:node.id,label:node.label,x:0,y:0,z:0,radius:nodeRadius[kind],color:COLORS[kind],major:true});
        return;
      }
      const count=Math.max(1,ordered.length);
      const phase=((hash32(kind)%1000)/1000)*Math.PI*2;
      const angle=phase+(index/count)*Math.PI*2;
      const radius=radiusByKind[kind];
      const wobble=((hash32(node.id)%1000)/1000-.5);
      result.push({
        id:node.id,label:node.label,
        x:Math.cos(angle)*radius,
        y:Math.sin(angle)*radius*.62+wobble*26,
        z:Math.sin(angle*1.7)*radius*.46+wobble*34,
        radius:nodeRadius[kind],color:COLORS[kind],
        major:['LAYER','TRANSPORT','FAMILY','BACKEND','ROLE'].includes(kind),
      });
    });
  }
  return result;
}


type ViewMode='all'|'tools'|'capabilities'|'runtime'|'roles';
type SyncState='idle'|'loading'|'same'|'updated'|'error';

const modeKinds:Record<ViewMode,NodeKind[]>={
  all:['ROOT','LAYER','TRANSPORT','TOOL','FAMILY','CAPABILITY','BACKEND','ROLE'],
  tools:['ROOT','LAYER','TRANSPORT','TOOL'],
  capabilities:['ROOT','LAYER','FAMILY','CAPABILITY','BACKEND','ROLE'],
  runtime:['ROOT','LAYER','CAPABILITY','BACKEND'],
  roles:['ROOT','LAYER','FAMILY','CAPABILITY','ROLE'],
};
const relationKindLabels:Record<NodeKind,string>={
  ROOT:'MCP',LAYER:'Camadas',TRANSPORT:'Transportes',TOOL:'Tools',
  FAMILY:'Famílias',CAPABILITY:'Capabilities',BACKEND:'Runtimes',ROLE:'Roles',
};
function allowedInMode(node:TopologyNode,mode:ViewMode){
  return modeKinds[mode].includes(node.kind);
}
function nodeMatches(node:TopologyNode,query:string){
  if(!query)return true;
  const haystack=[node.label,node.id,node.kind,node.group,node.status,node.summary||'']
    .join(' ').toLowerCase();
  return haystack.includes(query);
}
function matchRank(node:TopologyNode,query:string){
  const label=node.label.toLowerCase();
  const id=node.id.toLowerCase();
  if(label===query)return 0;
  if(id===query)return 1;
  if(label.startsWith(query))return 2;
  if(id.startsWith(query))return 3;
  return 4;
}
function topologySignature(topology:Topology){
  return topology.source.projection_fingerprint
    ||[topology.source.commit,topology.generated_at,topology.nodes.length,topology.links.length].join('|');
}

function Graph({topology,search,mode,selected,onSelect}:{topology:Topology;search:string;mode:ViewMode;selected:string|null;onSelect:(id:string|null)=>void}){
  const ref=useRef<CanvasGraph25DHandle|null>(null);
  const query=search.trim().toLowerCase();
  const visible=useMemo(()=>{
    const nodes=topology.nodes.filter(node=>allowedInMode(node,mode));
    const ids=new Set(nodes.map(node=>node.id));
    const links=topology.links.filter(link=>ids.has(idOf(link.source))&&ids.has(idOf(link.target)));
    return {nodes,links};
  },[topology,mode]);

  const matchedIds=useMemo(
    ()=>new Set(query?visible.nodes.filter(node=>nodeMatches(node,query)).map(node=>node.id):[]),
    [query,visible.nodes],
  );
  const relatedIds=useMemo(()=>{
    const ids=new Set<string>(matchedIds);
    if(!query)return ids;
    for(const link of visible.links){
      const source=idOf(link.source),target=idOf(link.target);
      if(matchedIds.has(source)||matchedIds.has(target)){ids.add(source);ids.add(target);}
    }
    return ids;
  },[matchedIds,query,visible.links]);

  useEffect(()=>{
    if(selected)ref.current?.focusNode(selected,query?2.45:2.2);
  },[selected,query]);

  const byId=new Map(visible.nodes.map(node=>[node.id,node]));
  const canvasNodes=topologyLayout(visible.nodes).map(node=>{
    const source=byId.get(node.id)!;
    const isMatch=matchedIds.has(node.id);
    const isRelated=relatedIds.has(node.id);
    const opacity=query?(isMatch?1:(isRelated ? .56 : .09)):(selected&&node.id!==selected ? .42 : 1);
    return {
      ...node,
      opacity,
      major:node.major||node.id===selected||isMatch,
      importance:isMatch?1:node.importance,
      halo:isMatch?1:(node.id===selected ? .9 : node.halo),
    };
  });
  const canvasEdges:CanvasEdge25D[]=visible.links.map(link=>{
    const source=idOf(link.source),target=idOf(link.target);
    const touchesMatch=matchedIds.has(source)||matchedIds.has(target);
    const related=query&&(relatedIds.has(source)&&relatedIds.has(target));
    const baseOpacity=link.kind==='EXPOSES'?.58:.32;
    return {
      id:link.id,from:source,to:target,
      color:link.kind==='RUNS_ON'?'#67ef9a':link.kind==='AVAILABLE_TO'?'#ffc76b':link.kind==='EXPOSES'?'#79e9ff':'#64718a',
      opacity:query?(touchesMatch ? .72 : (related ? .34 : .045)):baseOpacity,
      width:Math.max(.8,Number(link.weight||.2)*1.35)*(touchesMatch?1.25:1),
      dashed:link.kind==='AVAILABLE_TO',
    };
  });

  return <div className="graph-shell" aria-label="Mapa 2.5D da estrutura MCP">
    <CanvasGraph25D ref={ref} nodes={canvasNodes} edges={canvasEdges} selectedId={selected} onSelect={onSelect} ariaLabel="Topologia MCP em Canvas 2.5D"/>
    {query&&<div className="search-readback" role="status">
      <b>{matchedIds.size}</b> correspondência{matchedIds.size===1?'':'s'} · conexões preservadas em contexto
    </div>}
    <div className="graph-vignette"/>
  </div>;
}

export function McpAtlasApp(){
  const [topology,setTopology]=useState<Topology|null>(null);
  const topologyRef=useRef<Topology|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [mode,setMode]=useState<ViewMode>('all');
  const [syncState,setSyncState]=useState<SyncState>('idle');
  const [checkedAt,setCheckedAt]=useState<Date|null>(null);

  const loadTopology=useCallback(async(manual=false,signal?:AbortSignal)=>{
    if(manual)setSyncState('loading');
    try{
      const url=new URL(endpoint());
      url.searchParams.set('readback',String(Date.now()));
      const response=await fetch(url,{cache:'no-store',signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const value=await response.json() as Topology;
      const previous=topologyRef.current;
      const changed=Boolean(previous)&&topologySignature(previous!)!==topologySignature(value);
      topologyRef.current=value;
      setTopology(value);
      setError('');
      setCheckedAt(new Date());
      if(manual)setSyncState(changed?'updated':'same');
    }catch(err){
      if((err as {name?:string})?.name==='AbortError')return;
      setError(String(err));
      if(manual)setSyncState('error');
    }
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    void loadTopology(false,controller.signal);
    return()=>controller.abort();
  },[loadTopology]);

  useEffect(()=>{
    if(!topology)return;
    const query=search.trim().toLowerCase();
    if(!query)return;
    const candidates=topology.nodes
      .filter(node=>allowedInMode(node,mode)&&nodeMatches(node,query))
      .sort((a,b)=>matchRank(a,query)-matchRank(b,query)||a.label.length-b.label.length||a.label.localeCompare(b.label));
    if(candidates[0])setSelected(candidates[0].id);
  },[search,mode,topology]);

  const selectedNode=useMemo(()=>topology?.nodes.find(node=>node.id===selected)||null,[topology,selected]);
  const relationContext=useMemo(()=>{
    if(!topology||!selectedNode)return null;
    const byId=new Map(topology.nodes.map(node=>[node.id,node]));
    const direct:Array<{link:TopologyLink;node:TopologyNode;direction:'in'|'out'}>=[];
    for(const link of topology.links){
      const source=idOf(link.source),target=idOf(link.target);
      if(source===selectedNode.id){
        const node=byId.get(target);if(node)direct.push({link,node,direction:'out'});
      }else if(target===selectedNode.id){
        const node=byId.get(source);if(node)direct.push({link,node,direction:'in'});
      }
    }
    const distances=new Map<string,number>([[selectedNode.id,0]]);
    let frontier=[selectedNode.id];
    for(let depth=1;depth<=2;depth+=1){
      const next:string[]=[];
      for(const current of frontier){
        for(const link of topology.links){
          const source=idOf(link.source),target=idOf(link.target);
          const other=source===current?target:target===current?source:null;
          if(other&&!distances.has(other)){distances.set(other,depth);next.push(other);}
        }
      }
      frontier=next;
    }
    const groups=new Map<NodeKind,TopologyNode[]>();
    for(const [id,distance] of distances){
      if(distance===0)continue;
      const node=byId.get(id);if(!node)continue;
      const bucket=groups.get(node.kind)||[];
      bucket.push(node);groups.set(node.kind,bucket);
    }
    for(const bucket of groups.values())bucket.sort((a,b)=>a.label.localeCompare(b.label));
    return {direct,groups};
  },[topology,selectedNode]);

  const updated=topology?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(topology.generated_at)):'';
  const checked=checkedAt?new Intl.DateTimeFormat('pt-BR',{timeStyle:'medium'}).format(checkedAt):'';
  const syncMessage=syncState==='loading'?'Sincronizando…'
    :syncState==='same'?'Sem alterações · verificado '+checked
    :syncState==='updated'?'Atualizado · verificado '+checked
    :syncState==='error'?'Falha ao verificar a projeção publicada'
    :checked?'Verificado '+checked:'';

  const applyMode=(next:ViewMode)=>{
    setMode(next);
    setSelected(null);
    requestAnimationFrame(()=>document.getElementById('topology')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };

  const statCards:Array<{mode:ViewMode;index:string;title:string;body:string}> = topology ? [
    {mode:'tools',index:'01',title:'Tools expostas',body:String(topology.stats.remote_tools)+' tools remotos e '+String(topology.stats.internal_tools)+' internos.'},
    {mode:'capabilities',index:'02',title:'Capabilities registradas',body:String(topology.stats.capabilities)+' capabilities registradas na Tower.'},
    {mode:'runtime',index:'03',title:'Backends de runtime',body:Object.entries(topology.stats.backend_counts).slice(0,4).map(([k,v])=>k+' ('+String(v)+')').join(' · ')},
    {mode:'roles',index:'04',title:'Roles declaradas',body:String(topology.stats.roles)+' papéis conectados às capabilities declaradas.'},
  ] : [];

  return <div className="mcp-site">
    <nav className="mcp-nav">
      <a className="mcp-brand" href="../"><span className="mark">N</span><span>NEXO <em>ONE</em></span><b>MCP ATLAS</b></a>
      <div className="nav-links"><a href="../">Cockpit</a><a href="#topology">Topologia</a><a href="#architecture">Relações</a><a href="#source">Fonte</a></div>
      <span className="live-pill"><i/> TOWER_V06</span>
    </nav>

    <main>
      <section className="hero" id="topology">
        <div className="hero-copy">
          <div className="kicker">TOWER_V06 · MCP STRUCTURE · READ-ONLY</div>
          <h1>Topologia MCP<br/><span>da revisão atual.</span></h1>
          <p>Tools expostas, capabilities registradas, backends de runtime e roles. O mapa preserva as relações declaradas e usa o snapshot Drive publicado como origem verificável.</p>
          {topology&&<div className="metrics">
            <div><strong>{topology.stats.tools}</strong><span>tools</span></div>
            <div><strong>{topology.stats.capabilities}</strong><span>capabilities</span></div>
            <div><strong>{topology.stats.backends}</strong><span>runtimes</span></div>
            <div><strong>{topology.stats.roles}</strong><span>roles</span></div>
          </div>}
          <div className="hero-actions">
            <a className="primary-cta" href="../">Abrir NEXO ONE</a>
            <button className="sync-button" type="button" onClick={()=>void loadTopology(true)} disabled={syncState==='loading'}>
              {syncState==='loading'?'Sincronizando…':'Sincronizar'}
            </button>
            {syncMessage&&<span className={['sync-feedback',syncState].join(' ')}>{syncMessage}</span>}
          </div>
          {topology&&<div className="freshness">
            Publicado {updated}
            {topology.source.source_snapshot_id&&<> · snapshot <code>{topology.source.source_snapshot_id}</code></>}
          </div>}
        </div>

        <div className="hero-graph">
          <div className="graph-toolbar">
            <div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar node, tool, runtime..." /></div>
            <div className="modes">
              {([['all','Tudo'],['tools','Tools'],['capabilities','Capabilities'],['runtime','Runtime'],['roles','Roles']] as const).map(([id,label])=>
                <button key={id} className={mode===id?'active':''} onClick={()=>applyMode(id)}>{label}</button>
              )}
            </div>
          </div>
          {error&&!topology?<div className="graph-error"><b>Topologia indisponível</b><span>{error}</span></div>:
            topology?<Graph topology={topology} search={search} mode={mode} selected={selected} onSelect={setSelected}/>:
            <div className="graph-loading"><span/><p>Compilando topologia MCP…</p></div>}
          {selectedNode&&<aside className="node-inspector">
            <button className="close" onClick={()=>setSelected(null)}>×</button>
            <span className="node-kind">{kindLabel(selectedNode.kind)}</span>
            <h2>{selectedNode.label}</h2>
            <div className="node-status">{selectedNode.status}</div>
            {selectedNode.summary&&<p>{selectedNode.summary}</p>}
            {selectedNode.meta&&<dl>{Object.entries(selectedNode.meta).filter(([,v])=>v!==null&&v!==''&&!(Array.isArray(v)&&!v.length)).map(([k,v])=>
              <div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{Array.isArray(v)?v.join(', '):String(v)}</dd></div>
            )}</dl>}
            {relationContext&&<div className="relation-context">
              {(['TOOL','CAPABILITY','BACKEND','ROLE'] as NodeKind[]).map(kind=>{
                const rows=relationContext.groups.get(kind)||[];
                return <section key={kind} className="relation-group">
                  <header><span>{relationKindLabels[kind]}</span><b>{rows.length}</b></header>
                  {rows.length?<div className="relation-chips">{rows.slice(0,12).map(node=>
                    <button type="button" key={node.id} onClick={()=>setSelected(node.id)}>{node.label}</button>
                  )}{rows.length>12&&<span>+{rows.length-12}</span>}</div>:<p>Nenhuma relação declarada em até 2 saltos.</p>}
                </section>;
              })}
              <section className="direct-relations">
                <header><span>Relações diretas</span><b>{relationContext.direct.length}</b></header>
                {relationContext.direct.slice(0,14).map(({link,node,direction})=>
                  <button type="button" key={link.id+':'+node.id} onClick={()=>setSelected(node.id)}>
                    <small>{direction==='out'?'→':'←'} {link.kind}</small><strong>{node.label}</strong>
                  </button>
                )}
              </section>
            </div>}
          </aside>}
        </div>
      </section>

      {topology&&<section className="architecture" id="architecture">
        <div className="section-head">
          <span>RELAÇÕES PUBLICADAS</span>
          <h2>Encadeamento declarado<br/>no MCP e na Tower.</h2>
          <p>As arestas publicadas são EXPOSES, CONTAINS, RUNS_ON e AVAILABLE_TO. Os cards abaixo também funcionam como filtros do grafo.</p>
        </div>
        <div className="arch-flow">
          {statCards.map(card=><button type="button" key={card.mode} className={mode===card.mode?'active':''} aria-pressed={mode===card.mode} onClick={()=>applyMode(card.mode)}>
            <span>{card.index}</span><h3>{card.title}</h3><p>{card.body}</p><em>Filtrar grafo ↑</em>
          </button>)}
        </div>
      </section>}

      <section className="source-section" id="source">
        <div><span className="kicker">FONTE CANÔNICA</span><h2>Revisão e snapshot<br/>usados no build.</h2></div>
        {topology&&<div className="source-card">
          <div><span>authority</span><b>{topology.source.authority}</b></div>
          <div><span>storage</span><b>{topology.source.source_storage||'projection mirror'}</b></div>
          <div><span>snapshot</span><code>{topology.source.source_snapshot_id||'n/a'}</code></div>
          <div><span>state fp</span><code>{topology.source.source_state_fingerprint?.slice(0,28)||'n/a'}</code></div>
          <div><span>projection fp</span><code>{topology.source.projection_fingerprint?.slice(0,28)||'n/a'}</code></div>
          <div><span>commit</span><code>{topology.source.commit.slice(0,12)}</code></div>
          <div><span>manifest</span><code>{topology.source.manifest}</code></div>
        </div>}
      </section>
    </main>

    <nav className="mcp-bottom-nav" aria-label="Navegação do MCP Atlas">
      <a href="../"><i>◎</i><span>NEXO ONE</span></a>
      <a href="#topology" className="active"><i>⌬</i><span>Topologia</span></a>
      <a href="#architecture"><i>→</i><span>Relações</span></a>
      <a href="#source"><i>⊞</i><span>Fonte</span></a>
    </nav>
    <footer><span>NEXO ONE · MCP ATLAS</span><span>TOWER_V06 · projection-only</span></footer>
  </div>;
}
