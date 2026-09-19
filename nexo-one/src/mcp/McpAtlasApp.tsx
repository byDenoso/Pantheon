import {useEffect,useMemo,useState} from 'react';
import {CanvasGraph25D,type CanvasEdge25D,type CanvasNode25D} from '../components/CanvasGraph25D.tsx';

type NodeKind='ROOT'|'LAYER'|'TRANSPORT'|'TOOL'|'FAMILY'|'CAPABILITY'|'BACKEND'|'ROLE';
type TopologyNode={
  id:string;label:string;kind:NodeKind;group:string;status:string;summary?:string;
  meta?:Record<string,unknown>;
};
type TopologyLink={id:string;source:string|TopologyNode;target:string|TopologyNode;kind:string;weight:number};
type Topology={
  contract:string;generated_at:string;
  source:{authority:string;repository:string;commit:string;manifest:string;mcp_server:string;remote_mcp:string};
  stats:{tools:number;remote_tools:number;internal_tools:number;capabilities:number;backends:number;roles:number;families:number;status_counts:Record<string,number>;backend_counts:Record<string,number>};
  nodes:TopologyNode[];links:TopologyLink[];
};

const COLORS:Record<NodeKind,string>={
  ROOT:'#ffffff',LAYER:'#8b93a6',TRANSPORT:'#7df2c8',TOOL:'#56c7ff',
  FAMILY:'#a9b2c8',CAPABILITY:'#9c7cff',BACKEND:'#76f7a7',ROLE:'#ffc76b',
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

function Graph({topology,search,mode,selected,onSelect}:{topology:Topology;search:string;mode:string;selected:string|null;onSelect:(id:string|null)=>void}){
  const query=search.trim().toLowerCase();
  const visible=useMemo(()=>{
    const allowed=(node:TopologyNode)=>{
      if(mode==='tools')return ['ROOT','LAYER','TRANSPORT','TOOL'].includes(node.kind);
      if(mode==='capabilities')return ['ROOT','LAYER','FAMILY','CAPABILITY','BACKEND','ROLE'].includes(node.kind);
      if(mode==='runtime')return ['ROOT','LAYER','CAPABILITY','BACKEND'].includes(node.kind);
      return true;
    };
    const nodes=topology.nodes.filter(allowed);
    const ids=new Set(nodes.map(node=>node.id));
    const links=topology.links.filter(link=>ids.has(idOf(link.source))&&ids.has(idOf(link.target)));
    return {nodes,links};
  },[topology,mode]);

  const matches=(node:TopologyNode)=>!query||node.label.toLowerCase().includes(query)||node.kind.toLowerCase().includes(query)||node.status.toLowerCase().includes(query);
  const byId=new Map(visible.nodes.map(node=>[node.id,node]));
  const canvasNodes=topologyLayout(visible.nodes).map(node=>{
    const source=byId.get(node.id)!;
    return {...node,opacity:query&&!matches(source)?.16:selected&&node.id!==selected?.42:1,major:node.major||node.id===selected};
  });
  const canvasEdges:CanvasEdge25D[]=visible.links.map(link=>({
    id:link.id,from:idOf(link.source),to:idOf(link.target),
    color:link.kind==='RUNS_ON'?'#67ef9a':link.kind==='AVAILABLE_TO'?'#ffc76b':link.kind==='EXPOSES'?'#79e9ff':'#64718a',
    opacity:link.kind==='EXPOSES'?.58:.32,
    width:Math.max(.8,Number(link.weight||.2)*1.35),
    dashed:link.kind==='AVAILABLE_TO',
  }));

  return <div className="graph-shell" aria-label="Mapa 2.5D da estrutura MCP">
    <CanvasGraph25D nodes={canvasNodes} edges={canvasEdges} selectedId={selected} onSelect={onSelect} ariaLabel="Topologia MCP em Canvas 2.5D"/>
    <div className="graph-vignette"/>
  </div>;
}

export function McpAtlasApp(){
  const [topology,setTopology]=useState<Topology|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [mode,setMode]=useState('all');

  useEffect(()=>{
    const controller=new AbortController();
    fetch(endpoint(),{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();})
      .then(value=>setTopology(value as Topology))
      .catch(err=>{if(err?.name!=='AbortError')setError(String(err));});
    return()=>controller.abort();
  },[]);

  const selectedNode=useMemo(()=>topology?.nodes.find(node=>node.id===selected)||null,[topology,selected]);
  const updated=topology?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(topology.generated_at)):'';

  return <div className="mcp-site">
    <nav className="mcp-nav">
      <a className="mcp-brand" href="../"><span className="mark">N</span><span>NEXO <em>ONE</em></span><b>MCP ATLAS</b></a>
      <div className="nav-links"><a href="../">Cockpit</a><a href="#topology">Topologia</a><a href="#architecture">Relações</a><a href="#source">Fonte</a></div>
      <span className="live-pill"><i/> TOWER_V06</span>
    </nav>

    <main>
      <section className="hero" id="topology">
        <div className="hero-copy">
          <div className="kicker">TOWER_V06 · CANVAS 2.5D · READ-ONLY</div>
          <h1>Topologia MCP<br/><span>da revisão atual.</span></h1>
          <p>Tools expostas, capabilities registradas, backends de runtime e roles. Nós e arestas são desenhados em Canvas 2D com profundidade projetada; CSS cuida da interface.</p>
          {topology&&<div className="metrics">
            <div><strong>{topology.stats.tools}</strong><span>tools</span></div>
            <div><strong>{topology.stats.capabilities}</strong><span>capabilities</span></div>
            <div><strong>{topology.stats.backends}</strong><span>runtimes</span></div>
            <div><strong>{topology.stats.remote_tools}</strong><span>remote tools</span></div>
          </div>}
          <div className="hero-actions">
            <a className="primary-cta" href="../">Abrir NEXO ONE</a>
            {topology&&<span className="freshness">Atualizado {updated}</span>}
          </div>
        </div>

        <div className="hero-graph">
          <div className="graph-toolbar">
            <div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar node, tool, runtime..." /></div>
            <div className="modes">
              {([['all','Tudo'],['tools','Tools'],['capabilities','Capabilities'],['runtime','Runtime']] as const).map(([id,label])=>
                <button key={id} className={mode===id?'active':''} onClick={()=>{setMode(id);setSelected(null);}}>{label}</button>
              )}
            </div>
          </div>
          {error?<div className="graph-error"><b>Topologia indisponível</b><span>{error}</span></div>:
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
          </aside>}
        </div>
      </section>

      {topology&&<section className="architecture" id="architecture">
        <div className="section-head">
          <span>RELAÇÕES PUBLICADAS</span>
          <h2>Encadeamento declarado<br/>no MCP e na Tower.</h2>
          <p>As arestas publicadas são EXPOSES, CONTAINS, RUNS_ON e AVAILABLE_TO. Agrupamentos por família servem ao layout; não criam dependências canônicas.</p>
        </div>
        <div className="arch-flow">
          <article><span>01</span><h3>Tools expostas</h3><p>{topology.stats.remote_tools} tools remotos e {topology.stats.internal_tools} internos.</p></article>
          <article><span>02</span><h3>Capabilities registradas</h3><p>{topology.stats.capabilities} capabilities registradas na Tower.</p></article>
          <article><span>03</span><h3>Backends de runtime</h3><p>{Object.entries(topology.stats.backend_counts).slice(0,4).map(([k,v])=>`${k} (${v})`).join(' · ')}</p></article>
          <article><span>04</span><h3>Roles declaradas</h3><p>{topology.stats.roles} papéis conectados às capabilities declaradas.</p></article>
        </div>
      </section>}

      <section className="source-section" id="source">
        <div><span className="kicker">FONTE CANÔNICA</span><h2>Revisão e arquivos<br/>usados no build.</h2></div>
        {topology&&<div className="source-card">
          <div><span>authority</span><b>{topology.source.authority}</b></div>
          <div><span>repository</span><b>{topology.source.repository}</b></div>
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
