import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useNexoStore} from '../data/NexoStore.tsx';
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
type SystemTab='overview'|'tools'|'capabilities'|'runtimes'|'roles'|'relations'|'provenance'|'graph';
const SYSTEM_TABS:Array<[SystemTab,string]>=[['overview','Visão geral'],['tools','Tools'],['capabilities','Capabilities'],['runtimes','Runtimes'],['roles','Roles'],['relations','Relações'],['provenance','Proveniência'],['graph','Grafo']];

const THEME_STORAGE_KEY='nexo.mcp.theme.v1';
const GRAPH_VIEW_STORAGE_KEY='nexo.mcp.graph-view.v1';
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
  const query=routeParams().get('graph');
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
    data-mcp-renderer={view==='2d'?'neural-2d':'neural-3d'} data-mcp-theme={theme}
    data-mcp-visible-nodes={visible.nodes.length} data-mcp-visible-links={visible.links.length}>
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
  {topology&&tab==='graph'&&<div className="system-graph-panel"><div className="system-graph-controls"><div className="system-graph-filters">{([['all','Tudo'],['tools','Tools'],['capabilities','Capabilities'],['runtime','Runtimes'],['roles','Papéis']] as const).map(([id,n])=><button type="button" className={mode===id?'active':''} onClick={()=>setMode(id)} key={id}>{n}</button>)}</div><div className="system-graph-views" role="group" aria-label="Visualização do grafo"><button type="button" className={graphView==='2d'?'active':''} onClick={()=>setGraphView('2d')}>2D</button><button type="button" className={graphView==='3d'?'active':''} onClick={()=>setGraphView('3d')}>3D</button></div><span>{topology.nodes.length} entidades · {topology.links.length} relações</span></div><Graph topology={topology} search={search} mode={mode} selected={selected} onSelect={setSelected} theme={activeTheme} view={graphView}/></div>}
  {selectedNode&&tab!=='graph'&&<aside className="system-row-inspector"><button type="button" onClick={()=>setSelected(null)} aria-label="Fechar detalhes">Fechar</button><strong>{selectedNode.label}</strong><span>{status(selectedNode.status)} · {kindLabel(selectedNode.kind)}</span>{selectedNode.summary&&<p>{selectedNode.summary}</p>}<a href={`#/atlas?lente=sistema&sel=${encodeURIComponent(selectedNode.id)}&view=2d`}>Ver no Mapa ↗</a></aside>}
 </main></div>;
}
