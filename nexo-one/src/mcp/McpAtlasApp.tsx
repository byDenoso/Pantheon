import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CanvasGraph25D,type CanvasEdge25D,type CanvasGraph25DHandle,type CanvasNode25D} from '../components/CanvasGraph25D.tsx';
import {dispatchProjectionSync,waitForProjectionSync} from '../data/projectionSync.ts';

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
type McpTheme='dark'|'light';
type GraphView='2d'|'3d';
type SyncState='idle'|'loading'|'same'|'updated'|'source-newer'|'error';

const THEME_STORAGE_KEY='nexo.mcp.theme.v1';
const GRAPH_VIEW_STORAGE_KEY='nexo.mcp.graph-view.v1';
const PUBLIC_NEXO_BASE=String(import.meta.env.VITE_PUBLIC_NEXO_BASE||'https://bydenoso.github.io/Pantheon/').replace(/\/?$/,'/');
const publicNexoUrl=(path='')=>new URL(path,PUBLIC_NEXO_BASE).toString();

function initialTheme():McpTheme{
  const query=new URLSearchParams(window.location.search).get('theme');
  if(query==='light'||query==='dark')return query;
  try{return window.localStorage.getItem(THEME_STORAGE_KEY)==='light'?'light':'dark';}catch{return'dark';}
}
function initialGraphView():GraphView{
  const query=new URLSearchParams(window.location.search).get('graph');
  if(query==='2d'||query==='3d')return query;
  try{return window.localStorage.getItem(GRAPH_VIEW_STORAGE_KEY)==='3d'?'3d':'2d';}catch{return'2d';}
}

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

function relationColor(kind:string,theme:McpTheme){
  if(kind==='RUNS_ON')return theme==='light'?'#15803d':'#67ef9a';
  if(kind==='AVAILABLE_TO')return theme==='light'?'#b45309':'#ffc76b';
  if(kind==='EXPOSES')return theme==='light'?'#0369a1':'#79e9ff';
  return theme==='light'?'#64748b':'#64718a';
}

function Graph({topology,search,mode,selected,onSelect,theme,view}:{topology:Topology;search:string;mode:ViewMode;selected:string|null;onSelect:(id:string|null)=>void;theme:McpTheme;view:GraphView}){
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
    if(view==='3d'&&selected)ref.current?.focusNode(selected,query?2.45:2.2);
  },[selected,query,view]);

  const byId=new Map(visible.nodes.map(node=>[node.id,node]));
  const canvasNodes=topologyLayout(visible.nodes).map(node=>{
    const source=byId.get(node.id)!;
    const isMatch=matchedIds.has(node.id);
    const isRelated=relatedIds.has(node.id);
    const opacity=query
      ? (isMatch ? 1 : (isRelated ? .56 : .09))
      : (selected && node.id!==selected ? .42 : 1);
    return {
      ...node,
      color:theme==='light'
        ? ({ROOT:'#6d28d9',LAYER:'#0369a1',TRANSPORT:'#0284c7',TOOL:'#0e7490',FAMILY:'#7c3aed',CAPABILITY:'#0369a1',BACKEND:'#0f766e',ROLE:'#c2410c'} as Record<NodeKind,string>)[source.kind]
        : COLORS[source.kind],
      opacity,
      major:node.major||node.id===selected||isMatch,
      importance:isMatch?1:node.importance,
      halo:isMatch ? 1 : (node.id===selected ? .9 : node.halo),
    };
  });
  const canvasEdges:CanvasEdge25D[]=visible.links.map(link=>{
    const source=idOf(link.source),target=idOf(link.target);
    const touchesMatch=matchedIds.has(source)||matchedIds.has(target);
    const related=query&&(relatedIds.has(source)&&relatedIds.has(target));
    const baseOpacity=link.kind==='EXPOSES'?.58:.32;
    return {
      id:link.id,from:source,to:target,
      color:relationColor(link.kind,theme),
      opacity:query ? (touchesMatch ? .72 : (related ? .34 : .045)) : baseOpacity,
      width:Math.max(.8,Number(link.weight||.2)*1.35)*(touchesMatch?1.25:1),
      dashed:link.kind==='AVAILABLE_TO',
    };
  });

  const nodePositions=new Map(canvasNodes.map(node=>[node.id,node]));
  return <div className="graph-shell" aria-label={view==='2d'?'Mapa neural 2D da estrutura MCP':'Mapa neural 3D da estrutura MCP'}
    data-mcp-renderer={view==='2d'?'neural-2d':'neural-3d'} data-mcp-theme={theme}>
    {view==='2d'?<svg className="mcp-neural-2d" viewBox="-330 -225 660 450" role="img" aria-label="Topologia MCP neural em 2D">
      <defs>
        <filter id="mcp-node-glow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g className="mcp-neural-edges">
        {visible.links.map(link=>{
          const from=nodePositions.get(idOf(link.source)),to=nodePositions.get(idOf(link.target));
          if(!from||!to)return null;
          const touches=selected&&(from.id===selected||to.id===selected);
          const mx=(from.x+to.x)/2, my=(from.y+to.y)/2-18;
          return <path key={link.id} d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
            stroke={relationColor(link.kind,theme)} className={touches?'selected':''}
            data-relation-kind={link.kind}/>;
        })}
      </g>
      <g className="mcp-neural-nodes">
        {canvasNodes.map(node=>{
          const source=byId.get(node.id)!;
          const active=node.id===selected;
          const matched=matchedIds.has(node.id);
          const r=Math.max(5,(node.radius||1)*5.2);
          const showLabel=active||matched||Boolean(node.major);
          return <g key={node.id} className={active?'mcp-neuron active':'mcp-neuron'} transform={`translate(${node.x} ${node.y})`}
            onClick={()=>onSelect(node.id)} role="button" tabIndex={0}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(node.id);}}}
            aria-label={source.label}>
            <circle className="halo" r={r+9} fill={node.color}/>
            <circle className="core" r={r} fill={node.color} filter="url(#mcp-node-glow)"/>
            <circle className="spark" r={Math.max(1.7,r*.22)}/>
            {showLabel&&<text y={r+12} textAnchor="middle">{source.label.length>28?source.label.slice(0,27)+'…':source.label}</text>}
          </g>;
        })}
      </g>
    </svg>:<CanvasGraph25D ref={ref} nodes={canvasNodes} edges={canvasEdges} selectedId={selected} onSelect={onSelect}
      ariaLabel="Topologia MCP neural em 3D" theme={theme}/>}
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
  const [search,setSearch]=useState(()=>new URLSearchParams(window.location.search).get('q')||'');
  const [mode,setMode]=useState<ViewMode>(()=>{
    const candidate=new URLSearchParams(window.location.search).get('mode') as ViewMode|null;
    return candidate&&Object.hasOwn(modeKinds,candidate)?candidate:'all';
  });
  const [syncState,setSyncState]=useState<SyncState>('idle');
  const [checkedAt,setCheckedAt]=useState<Date|null>(null);
  const [theme,setTheme]=useState<McpTheme>(initialTheme);
  const [graphView,setGraphView]=useState<GraphView>(initialGraphView);

  useEffect(()=>{
    document.documentElement.dataset.mcpTheme=theme;
    document.documentElement.style.colorScheme=theme;
    try{window.localStorage.setItem(THEME_STORAGE_KEY,theme);}catch{}
  },[theme]);
  useEffect(()=>{try{window.localStorage.setItem(GRAPH_VIEW_STORAGE_KEY,graphView);}catch{}},[graphView]);

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

  const synchronizeTopology=useCallback(async()=>{
    const current=topologyRef.current;
    if(!current){
      await loadTopology(true);
      return;
    }
    setSyncState('loading');
    try{
      const receipt=await dispatchProjectionSync(current.source.projection_fingerprint||'');
      if(receipt.outcome==='PUBLIC_PROJECTION_REFRESHED'){
        setCheckedAt(new Date());
        setSyncState(receipt.projection_fingerprint===(current.source.projection_fingerprint||'')?'same':'source-newer');
        return;
      }
      await waitForProjectionSync(receipt.request_id);
      await loadTopology(true);
    }catch(err){
      setError(String(err));
      setCheckedAt(new Date());
      setSyncState('error');
    }
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
    :syncState==='same'?'Sem alterações · origem pública confirmada '+checked
    :syncState==='updated'?'Atualizado · verificado '+checked
    :syncState==='source-newer'?'Nova projeção detectada na origem · publicação pendente'
    :syncState==='error'?(error.includes('credencial')||error.includes('SYNC_BRIDGE_NOT_CONFIGURED')?'Sync real indisponível · bridge sem credencial':'Sincronização real não confirmada')
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

  return <div className="mcp-site"
    data-mcp-ready={topology?'true':'false'}
    data-mcp-selected={selectedNode?.label||''}
    data-mcp-selected-kind={selectedNode?.kind||''}
    data-mcp-mode={mode}
    data-mcp-theme={theme}
    data-mcp-graph-view={graphView}
    data-mcp-query={search}
    data-mcp-node-count={topology?.nodes.length||0}
    data-mcp-link-count={topology?.links.length||0}>
    <nav className="mcp-nav">
      <a className="mcp-brand" href={publicNexoUrl()}><span className="mark">N</span><span>NEXO <em>ONE</em></span><b>MCP ATLAS</b></a>
      <div className="nav-links"><a href={publicNexoUrl()}>Cockpit</a><a href="#topology">Topologia</a><a href="#architecture">Relações</a><a href="#source">Fonte</a></div>
      <div className="nav-utilities">
        <button className="theme-toggle" type="button" onClick={()=>setTheme(current=>current==='dark'?'light':'dark')}
          aria-label={theme==='dark'?'Ativar tema claro':'Ativar tema escuro'}>{theme==='dark'?'☼':'☾'}</button>
        <span className="live-pill"><i/> TOWER_V06</span>
      </div>
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
            <a className="primary-cta" href={publicNexoUrl()}>Abrir NEXO ONE</a>
            <button className="sync-button" type="button" onClick={()=>void synchronizeTopology()} disabled={syncState==='loading'}>
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
            <div className="graph-view-switch" role="group" aria-label="Modo de visualização">
              <button type="button" className={graphView==='2d'?'active':''} onClick={()=>setGraphView('2d')}>Metro 2D</button>
              <button type="button" className={graphView==='3d'?'active':''} onClick={()=>setGraphView('3d')}>3D Explorar</button>
            </div>
            <div className="modes">
              {([['all','Tudo'],['tools','Tools'],['capabilities','Capabilities'],['runtime','Runtime'],['roles','Roles']] as const).map(([id,label])=>
                <button key={id} className={mode===id?'active':''} onClick={()=>applyMode(id)}>{label}</button>
              )}
            </div>
          </div>
          {error&&!topology?<div className="graph-error"><b>Topologia indisponível</b><span>{error}</span></div>:
            topology?<Graph topology={topology} search={search} mode={mode} selected={selected} onSelect={setSelected} theme={theme} view={graphView}/>:
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
      <a href={publicNexoUrl()}><i>◎</i><span>NEXO ONE</span></a>
      <a href="#topology" className="active"><i>⌬</i><span>Topologia</span></a>
      <a href="#architecture"><i>→</i><span>Relações</span></a>
      <a href="#source"><i>⊞</i><span>Fonte</span></a>
    </nav>
    <footer><span>NEXO ONE · MCP ATLAS</span><span>TOWER_V06 · projection-only</span></footer>
  </div>;
}
