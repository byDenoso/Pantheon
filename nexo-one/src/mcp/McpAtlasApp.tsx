import {useEffect,useMemo,useRef,useState} from 'react';
import ForceGraph3D,{type ForceGraphMethods} from 'react-force-graph-3d';

type NodeKind='ROOT'|'LAYER'|'TRANSPORT'|'TOOL'|'FAMILY'|'CAPABILITY'|'BACKEND'|'ROLE';
type TopologyNode={
  id:string;label:string;kind:NodeKind;group:string;status:string;summary?:string;
  meta?:Record<string,unknown>;x?:number;y?:number;z?:number;
};
type TopologyLink={id:string;source:string|TopologyNode;target:string|TopologyNode;kind:string;weight:number};
type Topology={
  contract:string;generated_at:string;
  source:{authority:string;repository:string;commit:string;manifest:string;mcp_server:string;remote_mcp:string};
  stats:{tools:number;remote_tools:number;internal_tools:number;capabilities:number;backends:number;roles:number;families:number;status_counts:Record<string,number>;backend_counts:Record<string,number>};
  nodes:TopologyNode[];links:TopologyLink[];
};
type GraphRef=ForceGraphMethods<TopologyNode,TopologyLink>;

const COLORS:Record<NodeKind,string>={
  ROOT:'#ffffff',LAYER:'#8b93a6',TRANSPORT:'#7df2c8',TOOL:'#56c7ff',
  FAMILY:'#a9b2c8',CAPABILITY:'#9c7cff',BACKEND:'#76f7a7',ROLE:'#ffc76b',
};
const muted='#252a34';
const endpoint=()=>new URL('./topology.json',window.location.href).toString();

function idOf(value:string|TopologyNode){return typeof value==='string'?value:value.id;}
function kindLabel(kind:NodeKind){
  return ({ROOT:'MCP',LAYER:'CAMADA',TRANSPORT:'TRANSPORTE',TOOL:'TOOL',FAMILY:'FAMÍLIA',CAPABILITY:'CAPABILITY',BACKEND:'RUNTIME',ROLE:'ROLE'} as Record<NodeKind,string>)[kind];
}
function short(value:string,max=38){return value.length>max?value.slice(0,max-1)+'…':value;}

function Graph({topology,search,mode,selected,onSelect}:{topology:Topology;search:string;mode:string;selected:string|null;onSelect:(id:string|null)=>void}){
  const ref=useRef<GraphRef|undefined>();
  const query=search.trim().toLowerCase();
  const visible=useMemo(()=>{
    const allowed=(node:TopologyNode)=>{
      if(mode==='tools')return ['ROOT','LAYER','TRANSPORT','TOOL'].includes(node.kind);
      if(mode==='capabilities')return ['ROOT','LAYER','FAMILY','CAPABILITY','BACKEND','ROLE'].includes(node.kind);
      if(mode==='runtime')return ['ROOT','LAYER','CAPABILITY','BACKEND'].includes(node.kind);
      return true;
    };
    const nodes=topology.nodes.filter(allowed).map(node=>({...node}));
    const ids=new Set(nodes.map(node=>node.id));
    const links=topology.links.filter(link=>ids.has(idOf(link.source))&&ids.has(idOf(link.target))).map(link=>({...link}));
    return {nodes,links};
  },[topology,mode]);

  useEffect(()=>{
    const graph=ref.current;
    if(!graph)return;
    const charge=graph.d3Force('charge') as {strength?:(v:number)=>unknown;distanceMax?:(v:number)=>unknown}|undefined;
    charge?.strength?.(-86);charge?.distanceMax?.(390);
    const link=graph.d3Force('link') as {distance?:(v:number|((l:TopologyLink)=>number))=>unknown;strength?:(v:number|((l:TopologyLink)=>number))=>unknown}|undefined;
    link?.distance?.((l:TopologyLink)=>l.kind==='RUNS_ON'?42:l.kind==='AVAILABLE_TO'?54:l.kind==='CONTAINS'?32:38);
    link?.strength?.((l:TopologyLink)=>Math.max(.08,Math.min(.7,Number(l.weight||.2)*.42)));
    graph.d3ReheatSimulation();
    const timer=window.setTimeout(()=>graph.zoomToFit(900,56),600);
    return()=>window.clearTimeout(timer);
  },[mode,topology]);

  const focus=(node:TopologyNode)=>{
    onSelect(node.id);
    const graph=ref.current;
    if(!graph)return;
    const x=Number(node.x||0),y=Number(node.y||0),z=Number(node.z||0);
    const distance=70;const norm=Math.hypot(x,y,z)||1;
    graph.cameraPosition({x:x+x/norm*distance,y:y+y/norm*distance,z:z+z/norm*distance},{x,y,z},900);
  };

  const matches=(node:TopologyNode)=>!query||node.label.toLowerCase().includes(query)||node.kind.toLowerCase().includes(query)||node.status.toLowerCase().includes(query);

  return <div className="graph-shell" aria-label="Mapa 3D da estrutura MCP">
    <ForceGraph3D
      ref={ref}
      graphData={visible}
      backgroundColor="rgba(0,0,0,0)"
      showNavInfo={false}
      controlType="orbit"
      enableNodeDrag={false}
      nodeLabel={node=>`<b>${short((node as TopologyNode).label,64)}</b><br/><small>${kindLabel((node as TopologyNode).kind)} · ${(node as TopologyNode).status}</small>`}
      nodeColor={node=>{
        const n=node as TopologyNode;
        if(query&&!matches(n))return muted;
        if(selected&&n.id!==selected)return COLORS[n.kind]+'66';
        return COLORS[n.kind];
      }}
      nodeVal={node=>{
        const n=node as TopologyNode;
        if(n.kind==='ROOT')return 18;
        if(n.kind==='LAYER')return 8;
        if(n.kind==='TRANSPORT')return 6;
        if(n.kind==='BACKEND')return 5.5;
        if(n.kind==='FAMILY')return 4.2;
        return n.kind==='CAPABILITY'?2.6:2.2;
      }}
      nodeOpacity={0.95}
      nodeResolution={14}
      linkColor={link=>{
        const l=link as TopologyLink;
        if(l.kind==='RUNS_ON')return '#67ef9a';
        if(l.kind==='AVAILABLE_TO')return '#ffc76b';
        if(l.kind==='EXPOSES')return '#79e9ff';
        return '#64718a';
      }}
      linkWidth={link=>Math.max(.12,Number((link as TopologyLink).weight||.2)*.42)}
      linkOpacity={0.32}
      linkCurvature={link=>(link as TopologyLink).kind==='AVAILABLE_TO'?.1:0}
      linkDirectionalParticles={link=>(link as TopologyLink).kind==='EXPOSES'?1:0}
      linkDirectionalParticleWidth={1.4}
      linkDirectionalParticleSpeed={0.003}
      onNodeClick={node=>focus(node as TopologyNode)}
      onBackgroundClick={()=>onSelect(null)}
      warmupTicks={80}
      cooldownTicks={220}
      d3VelocityDecay={0.3}
      rendererConfig={{antialias:true,alpha:true,powerPreference:'high-performance'}}
    />
    <div className="graph-vignette" />
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
      <a className="mcp-brand" href="../"><span className="mark">N</span><span>NEXO</span><b>MCP ATLAS</b></a>
      <div className="nav-links"><a href="#architecture">Arquitetura</a><a href="#topology">Topologia</a><a href="#source">Fonte</a></div>
      <span className="live-pill"><i/> TOWER_V06</span>
    </nav>

    <main>
      <section className="hero" id="topology">
        <div className="hero-copy">
          <div className="kicker">LIVE SYSTEM MAP · READ-ONLY</div>
          <h1>Seu MCP,<br/><span>visível em 3D.</span></h1>
          <p>Uma projeção espacial da estrutura canônica do NEXO: tools, capabilities, runtimes e papéis, compilados diretamente da Tower atual.</p>
          {topology&&<div className="metrics">
            <div><strong>{topology.stats.tools}</strong><span>tools</span></div>
            <div><strong>{topology.stats.capabilities}</strong><span>capabilities</span></div>
            <div><strong>{topology.stats.backends}</strong><span>runtimes</span></div>
            <div><strong>{topology.stats.remote_tools}</strong><span>remote tools</span></div>
          </div>}
          <div className="hero-actions">
            <a className="primary-cta" href="#architecture">Explorar arquitetura</a>
            {topology&&<span className="freshness">Atualizado {updated}</span>}
          </div>
        </div>

        <div className="hero-graph">
          <div className="graph-toolbar">
            <div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar node, tool, runtime..." /></div>
            <div className="modes">
              {[['all','Tudo'],['tools','Tools'],['capabilities','Capabilities'],['runtime','Runtime']].map(([id,label])=>
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
          <span>ARCHITECTURE</span>
          <h2>Da superfície semântica<br/>até o runtime.</h2>
          <p>O mapa não inventa dependências. Ele organiza relações declaradas no MCP e no manifest de capabilities, com agrupamentos visuais derivados apenas para navegação.</p>
        </div>
        <div className="arch-flow">
          <article><span>01</span><h3>MCP surface</h3><p>{topology.stats.remote_tools} tools remotos e {topology.stats.internal_tools} internos.</p></article>
          <article><span>02</span><h3>Capability fabric</h3><p>{topology.stats.capabilities} capabilities registradas na Tower.</p></article>
          <article><span>03</span><h3>Runtime backends</h3><p>{Object.entries(topology.stats.backend_counts).slice(0,4).map(([k,v])=>`${k} (${v})`).join(' · ')}</p></article>
          <article><span>04</span><h3>Governance</h3><p>{topology.stats.roles} papéis conectados às capabilities declaradas.</p></article>
        </div>
      </section>}

      <section className="source-section" id="source">
        <div>
          <span className="kicker">CANONICAL SOURCE</span>
          <h2>O site segue o MCP.<br/>Não o contrário.</h2>
        </div>
        {topology&&<div className="source-card">
          <div><span>authority</span><b>{topology.source.authority}</b></div>
          <div><span>repository</span><b>{topology.source.repository}</b></div>
          <div><span>commit</span><code>{topology.source.commit.slice(0,12)}</code></div>
          <div><span>manifest</span><code>{topology.source.manifest}</code></div>
        </div>}
      </section>
    </main>

    <footer><span>NEXO MCP ATLAS</span><span>Projection-only · GitHub Pages</span></footer>
  </div>;
}
