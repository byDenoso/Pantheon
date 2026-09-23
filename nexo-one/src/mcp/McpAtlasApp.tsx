import {useCallback,useEffect,useMemo,useState} from 'react';
import {useNexoStore} from '../data/NexoStore.tsx';
import {NexoGraph,type NexoGraphView} from '../components/NexoGraph.tsx';
import {buildAtlasGraphIndexes,type AtlasMetroModel,type AtlasMetroNode,type AtlasCrossLink} from '../atlas3d/atlasAdapter.ts';

type NodeKind='ROOT'|'LAYER'|'TRANSPORT'|'TOOL'|'FAMILY'|'CAPABILITY'|'BACKEND'|'ROLE';
type TopologyNode={
  id:string;label:string;kind:NodeKind;group:string;status:string;summary?:string;
  meta?:Record<string,unknown>;
};
type TopologyLink={id:string;source:string|TopologyNode;target:string|TopologyNode;kind:string;weight:number};
const idOf=(value:string|TopologyNode)=>typeof value==='string'?value:value.id;

function kindLabel(kind:NodeKind){
  return ({ROOT:'MCP',LAYER:'Camada',TRANSPORT:'Transporte',TOOL:'Tool',FAMILY:'Família',CAPABILITY:'Capability',BACKEND:'Runtime',ROLE:'Papel'} as Record<NodeKind,string>)[kind];
}

type Topology={
  contract:string;generated_at:string;
  source:{authority:string;repository:string;commit:string;manifest:string;mcp_server:string;remote_mcp:string;source_storage?:string;source_snapshot_id?:string;source_state_fingerprint?:string;source_promoted_at?:string;projection_fingerprint?:string};
  stats:{tools:number;remote_tools:number;internal_tools:number;capabilities:number;backends:number;roles:number;families:number;status_counts:Record<string,number>;backend_counts:Record<string,number>};
  nodes:TopologyNode[];links:TopologyLink[];
};

type ViewMode='all'|'tools'|'capabilities'|'runtime'|'roles';
type McpTheme='dark'|'light';
type GraphView=NexoGraphView;
type SystemTab='overview'|'tools'|'capabilities'|'runtimes'|'roles'|'relations'|'provenance'|'graph';
const SYSTEM_TABS:Array<[SystemTab,string]>=[['overview','Visão geral'],['tools','Tools'],['capabilities','Capabilities'],['runtimes','Runtimes'],['roles','Roles'],['relations','Relações'],['provenance','Proveniência'],['graph','Grafo']];

const THEME_STORAGE_KEY='nexo.mcp.theme.v1';
const GRAPH_VIEW_STORAGE_KEY='nexo.graph.view.v1';
const routeParams=()=>{
  const hash=window.location.hash;
  const query=hash.match(/^#\/?sistema\?(.+)$/i)?.[1];
  return query?new URLSearchParams(query):new URLSearchParams(window.location.search);
};
function initialSystemTab():SystemTab{
  const value=routeParams().get('tab') as SystemTab|null;
  return value&&SYSTEM_TABS.some(([id])=>id===value)?value:'overview';
}

function initialTheme():McpTheme{
  const query=routeParams().get('theme');
  if(query==='light'||query==='dark')return query;
  try{return window.localStorage.getItem(THEME_STORAGE_KEY)==='light'?'light':'dark';}catch{return'dark';}
}
function initialGraphView():GraphView{
  const query=routeParams().get('view')||routeParams().get('graph');
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

function systemDepth(kind:NodeKind):number{
  return ({ROOT:0,LAYER:1,TRANSPORT:1,TOOL:1,FAMILY:2,CAPABILITY:2,BACKEND:3,ROLE:4} as Record<NodeKind,number>)[kind]??1;
}
function systemEntityType(kind:NodeKind):AtlasMetroNode['entityType']{
  return kind==='BACKEND'?'RUNTIME':kind;
}
function systemGraphModel(topology:Topology,mode:ViewMode,search:string):AtlasMetroModel{
  const query=search.trim().toLowerCase();
  const allowed=topology.nodes.filter(node=>allowedInMode(node,mode));
  const allowedIds=new Set(allowed.map(node=>node.id));
  let included=new Set(allowedIds);
  if(query){
    const matched=new Set(allowed.filter(node=>nodeMatches(node,query)).map(node=>node.id));
    included=new Set(matched);
    for(const link of topology.links){
      const source=idOf(link.source),target=idOf(link.target);
      if(!allowedIds.has(source)||!allowedIds.has(target))continue;
      if(matched.has(source)||matched.has(target)){included.add(source);included.add(target);}
    }
  }
  const rootId='nexo.system.root';
  const visible=allowed.filter(node=>included.has(node.id));
  const relationCounts=new Map<string,number>();
  const links=topology.links.filter(link=>included.has(idOf(link.source))&&included.has(idOf(link.target)));
  for(const link of links){
    relationCounts.set(idOf(link.source),(relationCounts.get(idOf(link.source))||0)+1);
    relationCounts.set(idOf(link.target),(relationCounts.get(idOf(link.target))||0)+1);
  }
  const root:AtlasMetroNode={
    id:rootId,sourceId:null,name:'Sistema',domain:'NEXO',parentId:null,entityType:'ROOT',status:'LIVE',
    summary:'Topologia MCP publicada.',depth:0,childCount:visible.length,descendantCount:visible.length,
    relationCount:visible.length,mix:50,updatedAt:topology.generated_at,sourceRevision:topology.source.commit||null,
    fingerprint:topology.source.projection_fingerprint||null,authorityClass:topology.source.authority||null,
    sourceRef:null,sourceLinks:[],temporal:[],synthetic:true,
  };
  const nodes:AtlasMetroNode[]=[root,...visible.map(node=>({
    id:node.id,sourceId:node.id,name:node.label,domain:'NEXO' as const,parentId:rootId,entityType:systemEntityType(node.kind),
    status:node.status,summary:node.summary||kindLabel(node.kind),depth:systemDepth(node.kind),childCount:0,descendantCount:0,
    relationCount:relationCounts.get(node.id)||0,mix:50,updatedAt:topology.generated_at,sourceRevision:topology.source.commit||null,
    fingerprint:topology.source.projection_fingerprint||null,authorityClass:topology.source.authority||null,
    sourceRef:null,sourceLinks:[],temporal:[],synthetic:false,
  }))];
  const nodeMap=new Map(nodes.map(node=>[node.id,node]));
  const childrenMap=new Map<string,string[]>([[rootId,visible.map(node=>node.id)]]);
  for(const node of visible)childrenMap.set(node.id,[]);
  const crossLinks:AtlasCrossLink[]=links.map(link=>({
    id:link.id,source:idOf(link.source),target:idOf(link.target),label:link.kind,kind:link.kind,weight:Number(link.weight||1),
    aggregated:false,isLearning:false,learningScope:null,learningRef:null,learningKind:null,learningGroup:null,learningTheme:null,
    learningBasis:null,sourceAnchor:null,targetAnchor:null,bundleIndex:0,bundleCount:1,
  }));
  return {
    revision:[topologySignature(topology),mode,query].join('|'),generatedAt:topology.generated_at,roots:[rootId],nodes,nodeMap,
    childrenMap,crossLinks,...buildAtlasGraphIndexes(nodes,crossLinks),sourceNodeIds:new Set(nodes.map(node=>node.id)),
  };
}

function Graph({topology,search,mode,selected,onSelect,theme,view,onViewChange}:{topology:Topology;search:string;mode:ViewMode;selected:string|null;onSelect:(id:string|null)=>void;theme:McpTheme;view:GraphView;onViewChange:(view:GraphView)=>void}){
  const model=useMemo(()=>systemGraphModel(topology,mode,search),[topology,mode,search]);
  const expanded=useMemo(()=>new Set(model.roots),[model.revision]);
  const visible=Math.max(0,model.nodes.length-1);
  return <div className="graph-shell" aria-label={view==='2d'?'Mapa 2D da estrutura MCP':'Mapa 3D da estrutura MCP'}
    data-mcp-renderer={view==='2d'?'metro-2d':'three-3d'} data-mcp-theme={theme}
    data-mcp-visible-nodes={visible} data-mcp-visible-links={model.crossLinks.length}>
    <NexoGraph model={model} expanded={expanded} selectedId={selected} onSelect={id=>onSelect(id)}
      view={view} onViewChange={onViewChange} theme={theme}/>
  </div>;
}

function currentHashParams(){
  return new URLSearchParams(window.location.hash.split('?',2)[1]||'');
}
function replaceCurrentHashParams(params:URLSearchParams){
  const path=window.location.hash.replace(/^#\/?/,'').split('?',1)[0]||'cockpit/prova';
  window.history.replaceState(null,'',`#/${path}?${params.toString()}`);
}

export function McpTopologyGraph({theme='dark'}:{theme?:McpTheme}){
  const {loadPublishedContext}=useNexoStore();
  const [topology,setTopology]=useState<Topology|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [view,setView]=useState<GraphView>(()=>{
    const value=typeof window!=='undefined'?currentHashParams().get('view'):null;
    if(value==='2d'||value==='3d')return value;
    try{return localStorage.getItem(GRAPH_VIEW_STORAGE_KEY)==='3d'?'3d':'2d';}catch{return'2d';}
  });
  useEffect(()=>{
    const ctrl=new AbortController();
    void loadPublishedContext<Topology>(false,ctrl.signal).then(value=>setTopology(value.topology)).catch(reason=>{
      if((reason as {name?:string})?.name!=='AbortError')setError(String(reason));
    });
    return()=>ctrl.abort();
  },[loadPublishedContext]);
  const changeView=(next:GraphView)=>{
    setView(next);
    try{localStorage.setItem(GRAPH_VIEW_STORAGE_KEY,next);}catch{}
    const params=currentHashParams();params.set('view',next);replaceCurrentHashParams(params);
  };
  if(!topology)return <div className="system-loading" role="status">{error?'A topologia de prova não pôde ser carregada.':'Carregando topologia de prova…'}</div>;
  return <div className="proof-topology-surface" data-proof-graph-ready="true" data-proof-graph-view={view}>
    <Graph topology={topology} search="" mode="all" selected={selected} onSelect={setSelected} theme={theme} view={view} onViewChange={changeView}/>
  </div>;
}

export function McpAtlasApp({themeOverride,embedded=false}:{themeOverride?:string;onThemeToggle?:()=>void;embedded?:boolean}={}){
 const {loadPublishedContext}=useNexoStore();
 const [topology,setTopology]=useState<Topology|null>(null),[error,setError]=useState('');
 const [selected,setSelected]=useState<string|null>(null),[search,setSearch]=useState(()=>routeParams().get('q')||'');
 const [mode,setMode]=useState<ViewMode>(()=>{const m=routeParams().get('mode') as ViewMode|null;return m&&Object.hasOwn(modeKinds,m)?m:'all';});
 const [theme,setTheme]=useState<McpTheme>(initialTheme),[graphView,setGraphView]=useState<GraphView>(initialGraphView);
 const [tab,setTab]=useState<SystemTab>(initialSystemTab),activeTheme=(themeOverride as McpTheme|undefined)||theme;
 useEffect(()=>{document.documentElement.dataset.mcpTheme=activeTheme;if(!embedded){document.documentElement.style.colorScheme=activeTheme;try{localStorage.setItem(THEME_STORAGE_KEY,activeTheme);}catch{}}},[activeTheme,embedded]);
 useEffect(()=>{try{localStorage.setItem(GRAPH_VIEW_STORAGE_KEY,graphView);}catch{}},[graphView]);
 useEffect(()=>{const ctrl=new AbortController();void loadPublishedContext<Topology>(false,ctrl.signal).then(v=>setTopology(v.topology)).catch(e=>{if((e as {name?:string})?.name!=='AbortError')setError(String(e));});return()=>ctrl.abort();},[loadPublishedContext]);
 useEffect(()=>{if(!topology||!search.trim())return;const query=search.trim().toLowerCase();const match=topology.nodes.filter(node=>nodeMatches(node,query)).sort((a,b)=>matchRank(a,query)-matchRank(b,query))[0];if(match)setSelected(match.id);},[topology,search]);
 useEffect(()=>{const restore=()=>setTab(initialSystemTab());window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore);return()=>{window.removeEventListener('hashchange',restore);window.removeEventListener('popstate',restore);};},[]);
 const selectTab=(next:SystemTab)=>{setTab(next);const params=routeParams();params.set('tab',next);window.history.pushState(null,'',`#/sistema?${params.toString()}`);window.scrollTo({top:0,left:0,behavior:'auto'});};
 const changeGraphView=(next:GraphView)=>{setGraphView(next);const params=routeParams();params.set('tab','graph');params.set('view',next);params.delete('graph');window.history.replaceState(null,'',`#/sistema?${params.toString()}`);};
 const q=search.trim().toLowerCase(),named=(id:string)=>topology?.nodes.find(n=>n.id===id)?.label||id;
 const rows=(kind:NodeKind)=>topology?.nodes.filter(n=>n.kind===kind&&nodeMatches(n,q))||[];
 const tools=rows('TOOL'),caps=rows('CAPABILITY'),runtimes=rows('BACKEND'),roles=rows('ROLE'),selectedNode=topology?.nodes.find(n=>n.id===selected)||null;
 const relations=topology?.links.filter(l=>!q||`${named(idOf(l.source))} ${named(idOf(l.target))} ${l.kind}`.toLowerCase().includes(q))||[];
 const table=(heads:string[],body:React.ReactNode[],empty:string)=><div className="system-table-wrap"><table className="system-table"><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{body.length?body:<tr><td colSpan={heads.length} className="system-empty">{empty}</td></tr>}</tbody></table></div>;
 const status=(s:string)=>({REMOTE:'Remota',INTERNAL:'Interna',PASS:'Verificada',VERIFIED:'Verificada',UNKNOWN:'Desconhecida',UNVERIFIED:'Sem prova',RETIRED:'Retirada',LIVE:'Ativa',RUNTIME:'Runtime',ROLE:'Papel'} as Record<string,string>)[s.toUpperCase()]||s;
 const relation=(s:string)=>({EXPOSES:'Expõe',CONTAINS:'Contém',RUNS_ON:'Executa em',AVAILABLE_TO:'Disponível para',OWNS:'Mantém',GROUPS:'Agrupa'} as Record<string,string>)[s]||s;
 const updated=topology?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(topology.generated_at)):'';
 const label=SYSTEM_TABS.find(([id])=>id===tab)?.[1]||'Visão geral';
 return <div className="mcp-site system-native-root" data-mcp-embedded={embedded?'true':'false'} data-mcp-ready={topology?'true':'false'} data-mcp-query={search} data-mcp-selected={selectedNode?.label||''} data-mcp-selected-kind={selectedNode?.kind||''} data-mcp-theme={activeTheme} data-mcp-graph-view={graphView} data-mcp-node-count={topology?.nodes.length||0} data-mcp-link-count={topology?.links.length||0}>
 <main className="system-native" data-system-tab={tab} data-system-ready={topology?'true':'false'}>
  <header className="system-page-heading"><div><h1>Sistema</h1><p>Tools, capabilities, runtimes, papéis e relações da projeção.</p></div>{topology&&<span className="system-generated">Projeção · {updated}</span>}</header>
  <nav className="system-tabs" aria-label="Seções do Sistema">{SYSTEM_TABS.map(([id,name])=>{const count=id==='tools'?topology?.stats.tools:id==='capabilities'?topology?.stats.capabilities:id==='runtimes'?topology?.stats.backends:id==='roles'?topology?.stats.roles:id==='relations'?topology?.links.length:undefined;return <button key={id} type="button" className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>selectTab(id)}>{name}{count!==undefined&&<span>{count}</span>}</button>;})}</nav>
  {tab!=='overview'&&tab!=='provenance'&&<div className="system-filter"><label htmlFor="system-filter">Filtrar {label.toLowerCase()}</label><input id="system-filter" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, identificador ou estado"/></div>}
  {!topology&&<div className="system-loading" role="status">{error?'A projeção do Sistema não pôde ser carregada.':'Carregando a projeção do Sistema…'}</div>}
  {topology&&tab==='overview'&&<><div className="system-stat-row">{[[topology.stats.tools,'tools',`${topology.stats.remote_tools} remotas · ${topology.stats.internal_tools} internas`],[topology.stats.capabilities,'capabilities','registradas na projeção'],[topology.stats.backends,'runtimes',topology.stats.backend_counts.unknown?`${topology.stats.backend_counts.unknown} desconhecidos`:'identificados'],[topology.stats.roles,'papéis','declarados'],[topology.links.length,'relações','publicadas']].map(([v,n,d])=><div key={String(n)}><strong>{v}</strong><span>{n}</span><small>{d}</small></div>)}</div>
   {topology.stats.backend_counts.unknown>0&&<a className="system-integrity-note" href="#/cockpit/prova?view=integrity">Lacuna de integridade · {topology.stats.backend_counts.unknown} runtime desconhecido · ver Integridade ↗</a>}
   <div className="system-shortcuts">{SYSTEM_TABS.filter(([id])=>!['overview','graph'].includes(id)).map(([id,n])=>{const c=id==='tools'?topology.stats.tools:id==='capabilities'?topology.stats.capabilities:id==='runtimes'?topology.stats.backends:id==='roles'?topology.stats.roles:id==='relations'?topology.links.length:undefined;return <button key={id} type="button" onClick={()=>selectTab(id)}><span>{n}</span><strong>{c??'↗'}</strong></button>;})}</div>
   <div className="system-source-compact"><strong>Fonte consultada</strong><span>TOWER_V06 · snapshot {topology.source.source_snapshot_id||'não publicado'}</span><button type="button" onClick={()=>selectTab('provenance')}>Ver proveniência</button></div></>}
  {topology&&tab==='tools'&&table(['Tool','Acesso','Domínio / prefixo','Capabilities expostas','Runtime'],tools.map(n=><tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{n.label}</strong><small className="system-mono">{n.id}</small></td><td>{n.meta?.remote===true?'Remota':'Interna'}</td><td>{String(n.meta?.namespace||n.group)}</td><td>Não publicado</td><td>Não publicado</td></tr>),'Nenhuma tool corresponde ao filtro.')}
  {topology&&tab==='capabilities'&&table(['Capability','Domínio','Runtime','Evidência','Última verificação','Tools','Papéis','WORK'],caps.map(n=>{const m=n.meta||{};return <tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{String(m.id||n.label)}</strong><small className="system-mono">{n.id}</small></td><td>{String(m.scope||n.group||'Não publicado')}</td><td>{String(m.backend||'Não publicado')}</td><td><span className={`system-state ${String(m.status||n.status).toLowerCase()}`}>{status(String(m.status||n.status))}</span></td><td>Não publicado</td><td>Não publicado</td><td>{Array.isArray(m.roles)?m.roles.join(', '):'Não publicado'}</td><td>Não publicado</td></tr>;}),'Nenhuma capability corresponde ao filtro.')}
  {topology&&tab==='runtimes'&&table(['Runtime','Capabilities associadas','Estado','Evidência'],runtimes.map(n=><tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{n.label}</strong></td><td>{topology.stats.backend_counts[n.label]||0}</td><td>{n.label.toLowerCase()==='unknown'?'Lacuna de integridade':'Registrado'}</td><td>Não publicado</td></tr>),'Nenhum runtime corresponde ao filtro.')}
  {topology&&tab==='roles'&&table(['Papel','Capabilities disponíveis','Estado','Origem'],roles.map(n=><tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{n.label}</strong></td><td>{caps.filter(c=>Array.isArray(c.meta?.roles)&&c.meta.roles.includes(n.label)).length}</td><td>{status(n.status)}</td><td>Não publicado</td></tr>),'Nenhum papel corresponde ao filtro.')}
  {topology&&tab==='relations'&&table(['Origem','Relação','Destino','Peso'],relations.map(l=><tr key={l.id}><td>{named(idOf(l.source))}</td><td>{relation(l.kind)} <small className="system-mono">{l.kind}</small></td><td>{named(idOf(l.target))}</td><td className="system-mono">{Number(l.weight).toFixed(2)}</td></tr>),'Nenhuma relação corresponde ao filtro.')}
  {topology&&tab==='provenance'&&<div className="system-provenance"><h2>Proveniência da projeção publicada</h2><p>A Tower atribui autoridade ao repositório GitHub; esta publicação identifica um snapshot espelhado em Google Drive. Autoridade e origem da cópia pública precisam permanecer alinhadas.</p>{[['Autoridade declarada','TOWER_V06'],['Armazenamento',topology.source.source_storage||'Não publicado'],['Snapshot',topology.source.source_snapshot_id||'Não publicado'],['Fingerprint do estado',topology.source.source_state_fingerprint||'Não publicado'],['Fingerprint da projeção',topology.source.projection_fingerprint||'Não publicado'],['Commit',topology.source.commit||'Não publicado'],['Manifest',topology.source.manifest||'Não publicado']].map(([n,v])=><div key={n}><span>{n}</span><code>{v}</code></div>)}</div>}
  {topology&&tab==='graph'&&<div className="system-graph-panel"><div className="system-graph-controls"><div className="system-graph-filters">{([['all','Tudo'],['tools','Tools'],['capabilities','Capabilities'],['runtime','Runtimes'],['roles','Papéis']] as const).map(([id,n])=><button type="button" className={mode===id?'active':''} onClick={()=>setMode(id)} key={id}>{n}</button>)}</div><span>{topology.nodes.length} entidades · {topology.links.length} relações</span></div><Graph topology={topology} search={search} mode={mode} selected={selected} onSelect={setSelected} theme={activeTheme} view={graphView} onViewChange={changeGraphView}/></div>}
  {selectedNode&&tab!=='graph'&&<aside className="system-row-inspector"><button type="button" onClick={()=>setSelected(null)} aria-label="Fechar detalhes">Fechar</button><strong>{selectedNode.label}</strong><span>{status(selectedNode.status)} · {kindLabel(selectedNode.kind)}</span>{selectedNode.summary&&<p>{selectedNode.summary}</p>}<a href={`#/atlas?lente=sistema&sel=${encodeURIComponent(selectedNode.id)}&view=2d`}>Ver no Mapa ↗</a></aside>}
 </main></div>;
}
