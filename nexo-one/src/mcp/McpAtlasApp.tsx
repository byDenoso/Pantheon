import {McpControlPanel} from './McpControlPanel.tsx';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useNexoStore} from '../data/NexoStore.tsx';
import {NexoGraph,type NexoGraphView} from '../components/NexoGraph.tsx';
import {buildAtlasGraphIndexes,type AtlasMetroModel,type AtlasMetroNode,type AtlasCrossLink} from '../atlas3d/atlasAdapter.ts';
import {humanizeText} from '../viewmodels/tokens.ts';

type NodeKind='ROOT'|'LAYER'|'TRANSPORT'|'TOOL'|'FAMILY'|'CAPABILITY'|'BACKEND'|'ROLE';
type TopologyNode={
  id:string;label:string;kind:NodeKind;group:string;status:string;summary?:string;
  meta?:Record<string,unknown>;
};
type TopologyLink={id:string;source:string|TopologyNode;target:string|TopologyNode;kind:string;weight:number};
const idOf=(value:string|TopologyNode)=>typeof value==='string'?value:value.id;

function kindLabel(kind:NodeKind){
  return ({ROOT:'Sistema',LAYER:'Parte do sistema',TRANSPORT:'Canal',TOOL:'Ferramenta',FAMILY:'Grupo de ferramentas',CAPABILITY:'Recurso disponível',BACKEND:'Serviço executor',ROLE:'Equipe de automação'} as Record<NodeKind,string>)[kind];
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
type SystemTab='mcp'|'overview'|'tools'|'capabilities'|'runtimes'|'roles'|'relations'|'provenance'|'graph';
// 'graph' stays reachable by deep link (?tab=graph, WebMCP + Pages readback) but is
// hidden from the tab strip: the Mapa already is the graph surface.
const SYSTEM_TABS:Array<[SystemTab,string]>=[['overview','Visão geral'],['mcp','MCP'],['tools','Ferramentas'],['capabilities','Recursos disponíveis'],['runtimes','Serviços executores'],['roles','Equipes de automação'],['relations','Ligações'],['provenance','Origem dos dados'],['graph','Mapa']];
const SYSTEM_TAB_GUIDE:Partial<Record<SystemTab,string>>={
  tools:'Ferramentas são ações que uma automação pode chamar. Cada linha mostra onde a ferramenta está e que recursos oferece.',
  capabilities:'Recursos descrevem o que o sistema pode fazer. Uma situação verificada indica que a fonte confirmou essa informação.',
  runtimes:'Serviços executores rodam tarefas. A contagem mostra quantos recursos estão associados a cada serviço.',
  roles:'Equipes de automação agrupam responsabilidades. A contagem mostra quantos recursos estão disponíveis para cada equipe.',
  relations:'As ligações explicam qual parte oferece, executa, mantém ou depende de outra parte do sistema.',
  provenance:'Esta seção explica de onde vieram os dados e permite conferir os códigos da versão publicada.',
  graph:'O mapa mostra as partes do sistema e como se conectam. Selecione uma parte para ver seu papel e sua situação.',
};

const THEME_STORAGE_KEY='nexo.mcp.theme.v1';
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
  return '2d';
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
    summary:'Mapa das partes do sistema e das conexões entre elas.',depth:0,childCount:visible.length,descendantCount:visible.length,
    relationCount:visible.length,mix:50,updatedAt:topology.generated_at,sourceRevision:topology.source.commit||null,
    fingerprint:topology.source.projection_fingerprint||null,authorityClass:topology.source.authority||null,
    sourceRef:null,sourceLinks:[],temporal:[],synthetic:true,
  };
  const nodes:AtlasMetroNode[]=[root,...visible.map(node=>({
    id:node.id,sourceId:node.id,name:humanizeText(node.label),domain:'NEXO' as const,parentId:rootId,entityType:systemEntityType(node.kind),
    status:node.status,summary:humanizeText(node.summary||kindLabel(node.kind)),depth:systemDepth(node.kind),childCount:0,descendantCount:0,
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
    return '2d';
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
 const status=(s:string)=>({REMOTE:'Serviço externo',INTERNAL:'Parte do NEXO',PASS:'Verificado',VERIFIED:'Confirmado',UNKNOWN:'Ainda não identificado',UNVERIFIED:'Sem confirmação',RETIRED:'Desativado',LIVE:'Ativo',RUNTIME:'Serviço executor',ROLE:'Equipe',BLOCKED:'Bloqueado',READY:'Pronto para começar',RUNNING:'Em execução',PENDING:'Aguardando',FAILED:'Falhou',DEGRADED:'Com limitações',CLOSED:'Encerrado'} as Record<string,string>)[s.toUpperCase()]||'Situação ainda sem explicação';
 const relation=(s:string)=>({EXPOSES:'Disponibiliza',CONTAINS:'Contém',RUNS_ON:'É executado por',AVAILABLE_TO:'Pode ser usado por',OWNS:'Mantém',GROUPS:'Agrupa',PRODUCES:'Produz',VERIFIES:'Verifica',DEPENDS_ON:'Depende de',PROJECTS:'Representa',CONTRADICTS:'Contradiz',SUPPORTS:'Sustenta',ROUTES_TO:'Encaminha para',BLOCKS:'Impede',DERIVES_FROM:'Vem de'} as Record<string,string>)[s]||'Ligação registrada';
 const updated=topology?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(topology.generated_at)):'';
 const label=SYSTEM_TABS.find(([id])=>id===tab)?.[1]||'Visão geral';
 return <div className="mcp-site system-native-root" data-mcp-embedded={embedded?'true':'false'} data-mcp-ready={topology?'true':'false'} data-mcp-query={search} data-mcp-selected={selectedNode?.label||''} data-mcp-selected-kind={selectedNode?.kind||''} data-mcp-theme={activeTheme} data-mcp-graph-view={graphView} data-mcp-node-count={topology?.nodes.length||0} data-mcp-link-count={topology?.links.length||0}>
 <main className="system-native" data-system-tab={tab} data-system-ready={topology?'true':'false'}>
  <header className="system-page-heading"><div><h1>Sistema</h1><p>Veja quais ferramentas e recursos o NEXO tem disponíveis, quais equipes e serviços os mantêm e como essas partes se conectam.</p></div>{topology&&<span className="system-generated">Informações publicadas · {updated}</span>}</header>
  <nav className="system-tabs" aria-label="Seções do Sistema">{SYSTEM_TABS.filter(([id])=>id!=='graph'||tab==='graph').map(([id,name])=>{const count=id==='tools'?topology?.stats.tools:id==='capabilities'?topology?.stats.capabilities:id==='runtimes'?topology?.stats.backends:id==='roles'?topology?.stats.roles:id==='relations'?topology?.links.length:undefined;return <button key={id} type="button" className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>selectTab(id)}>{name}{count!==undefined&&<span>{count}</span>}</button>;})}</nav>
  {SYSTEM_TAB_GUIDE[tab]&&<p className="system-intro">{SYSTEM_TAB_GUIDE[tab]}</p>}
  {tab!=='overview'&&tab!=='provenance'&&tab!=='mcp'&&<div className="system-filter"><label htmlFor="system-filter">Buscar em {label.toLowerCase()}</label><input id="system-filter" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, código ou situação"/></div>}
  {tab==='mcp'&&<McpControlPanel/>}
  {!topology&&tab!=='mcp'&&<div className="system-loading" role="status">{error?'Não foi possível carregar os dados do sistema.':'Carregando os dados do sistema…'}</div>}
  {topology&&tab==='overview'&&<><p className="system-intro">Os totais contam as ferramentas, recursos, serviços e equipes descritos na versão atual do sistema. Se uma informação estiver ausente, ela aparece como não confirmada.</p><div className="system-stat-row">{[[topology.stats.tools,'ferramentas',`${topology.stats.remote_tools} externas · ${topology.stats.internal_tools} internas`],[topology.stats.capabilities,'recursos disponíveis','descritos nesta versão'],[topology.stats.backends,'serviços executores',topology.stats.backend_counts.unknown?`${topology.stats.backend_counts.unknown} sem identificação`:'identificados'],[topology.stats.roles,'equipes de automação','declaradas'],[topology.links.length,'ligações','descritas']].map(([v,n,d])=><div key={String(n)}><strong>{v}</strong><span>{n}</span><small>{d}</small></div>)}</div>
   {topology.stats.backend_counts.unknown>0&&<a className="system-integrity-note" href="#/cockpit/prova?view=integrity">Informação faltando · {topology.stats.backend_counts.unknown} serviços sem identificação · ver Integridade ↗</a>}
   <div className="system-shortcuts">{SYSTEM_TABS.filter(([id])=>!['overview','graph'].includes(id)).map(([id,n])=>{const c=id==='tools'?topology.stats.tools:id==='capabilities'?topology.stats.capabilities:id==='runtimes'?topology.stats.backends:id==='roles'?topology.stats.roles:id==='relations'?topology.links.length:undefined;return <button key={id} type="button" onClick={()=>selectTab(id)}><span>{n}</span><strong>{c??'↗'}</strong></button>;})}</div>
   <div className="system-source-compact"><strong>Registro consultado</strong><span>Informações lidas da versão atual do NEXO.</span><details><summary>Ver código da versão</summary><code>{topology.source.source_snapshot_id||'Sem código publicado'}</code></details><button type="button" onClick={()=>selectTab('provenance')}>De onde vieram estes dados?</button></div></>}
  {topology&&tab==='tools'&&table(['Ferramenta','Onde está','Área','Recursos que oferece','Serviço executor'],tools.map(n=><tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{humanizeText(n.label)}</strong><details><summary>Identificador técnico</summary><code>{n.id}</code></details></td><td>{n.meta?.remote===true?'Serviço externo':'Parte do NEXO'}</td><td>{humanizeText(String(n.meta?.namespace||n.group))}</td><td>Sem informação publicada</td><td>Sem informação publicada</td></tr>),'Nenhuma ferramenta corresponde à busca.')}
  {topology&&tab==='capabilities'&&table(['Recurso disponível','Área','Serviço executor','Situação','Última verificação','Ferramentas','Equipes','Ações ligadas'],caps.map(n=>{const m=n.meta||{};return <tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{humanizeText(n.label)}</strong><details><summary>Identificador técnico</summary><code>{n.id}</code></details></td><td>{humanizeText(String(m.scope||n.group||'Sem informação publicada'))}</td><td>{humanizeText(String(m.backend||'Sem informação publicada'))}</td><td><span className={`system-state ${String(m.status||n.status).toLowerCase()}`}>{status(String(m.status||n.status))}</span></td><td>Sem informação publicada</td><td>Sem informação publicada</td><td>{Array.isArray(m.roles)?m.roles.map(role=>humanizeText(String(role))).join(', '):'Sem informação publicada'}</td><td>Sem informação publicada</td></tr>;}),'Nenhum recurso corresponde à busca.')}
  {topology&&tab==='runtimes'&&table(['Serviço executor','Recursos associados','Situação','Comprovação'],runtimes.map(n=><tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{humanizeText(n.label)}</strong></td><td>{topology.stats.backend_counts[n.label]||0}</td><td>{n.label.toLowerCase()==='unknown'?'Falta identificação':'Registrado'}</td><td>Sem informação publicada</td></tr>),'Nenhum serviço corresponde à busca.')}
  {topology&&tab==='roles'&&table(['Equipe de automação','Recursos disponíveis','Situação','Origem'],roles.map(n=><tr key={n.id} onClick={()=>setSelected(n.id)}><td><strong>{humanizeText(n.label)}</strong></td><td>{caps.filter(c=>Array.isArray(c.meta?.roles)&&c.meta.roles.includes(n.label)).length}</td><td>{status(n.status)}</td><td>Sem informação publicada</td></tr>),'Nenhuma equipe corresponde à busca.')}
  {topology&&tab==='relations'&&table(['Parte que inicia','Como se conectam','Parte relacionada','Peso da ligação'],relations.map(l=><tr key={l.id}><td>{named(idOf(l.source))}</td><td>{relation(l.kind)} <details><summary>Ver código técnico</summary><code>{l.kind}</code></details></td><td>{named(idOf(l.target))}</td><td>{Number(l.weight).toFixed(2)}</td></tr>),'Nenhuma ligação corresponde à busca.')}
  {topology&&tab==='provenance'&&<div className="system-provenance"><h2>De onde veio esta informação</h2><p>Esta tela mostra uma cópia para consulta, gerada a partir do registro privado mantido pelo NEXO. Os códigos abaixo ajudam a localizar a origem e verificar que os dados não foram alterados durante a publicação.</p>{[['Fonte oficial','Registro privado do NEXO'],['Armazenamento',topology.source.source_storage||'Sem informação publicada'],['Versão consultada',topology.source.source_snapshot_id||'Sem informação publicada'],['Assinatura do estado',topology.source.source_state_fingerprint||'Sem informação publicada'],['Assinatura desta visão',topology.source.projection_fingerprint||'Sem informação publicada'],['Versão do código',topology.source.commit||'Sem informação publicada'],['Arquivo de descrição',topology.source.manifest||'Sem informação publicada']].map(([n,v])=><div key={n}><span>{n}</span><details><summary>Ver código técnico</summary><code>{v}</code></details></div>)}</div>}
  {topology&&tab==='graph'&&<div className="system-graph-panel"><div className="system-graph-controls"><div className="system-graph-filters">{([['all','Tudo'],['tools','Ferramentas'],['capabilities','Recursos'],['runtime','Serviços executores'],['roles','Equipes']] as const).map(([id,n])=><button type="button" className={mode===id?'active':''} onClick={()=>setMode(id)} key={id}>{n}</button>)}</div><span>{topology.nodes.length} partes · {topology.links.length} ligações</span></div><Graph topology={topology} search={search} mode={mode} selected={selected} onSelect={setSelected} theme={activeTheme} view={graphView} onViewChange={changeGraphView}/></div>}
  {selectedNode&&tab!=='graph'&&tab!=='mcp'&&<aside className="system-row-inspector"><button type="button" onClick={()=>setSelected(null)} aria-label="Fechar detalhes">Fechar</button><strong>{humanizeText(selectedNode.label)}</strong><span>{status(selectedNode.status)} · {kindLabel(selectedNode.kind)}</span>{selectedNode.summary&&<p>{humanizeText(selectedNode.summary)}</p>}<a href={`#/atlas?lente=sistema&sel=${encodeURIComponent(selectedNode.id)}&view=2d`}>Ver no Mapa ↗</a></aside>}
 </main></div>;
}
