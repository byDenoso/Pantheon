import {useEffect,useMemo,useState} from 'react';
import {GraphRenderer} from '../graph-engine/GraphRenderer';
import {buildLiveProjection} from '../graph-engine/live-projection';
import type {GraphNode} from '../graph-engine/types';
import type {AtlasNode} from '../scene/types';
import type {AtlasActions,AtlasUiState} from '../state/useAtlasSession';

type GraphMode='explore'|'relations'|'evidence';
const EVIDENCE_TYPES=new Set(['HYPOTHESIS','TEST','RUN','RESULT','EVIDENCE','CLAIM','DOCUMENT','PUBLICATION']);

function modeProjection(projection:ReturnType<typeof buildLiveProjection>,mode:GraphMode){
  if(mode!=='evidence')return projection;
  const keep=new Set(projection.nodes.filter(node=>node.id===projection.focusId||node.contextRole==='ancestor'||node.contextRole==='portal'||EVIDENCE_TYPES.has(node.type.toUpperCase())).map(node=>node.id));
  return {...projection,nodes:projection.nodes.filter(node=>keep.has(node.id)),edges:projection.edges.filter(edge=>keep.has(edge.source)&&keep.has(edge.target))};
}

export function GraphsPage({state,actions,reducedMotion,compact}:{state:AtlasUiState;actions:AtlasActions;reducedMotion:boolean;compact:boolean}){
  const [depth,setDepth]=useState(1);
  const [mode,setMode]=useState<GraphMode>('explore');
  const [immersive,setImmersive]=useState(false);
  const graph=state.graph;
  const total=Number(graph?.visualTotal??graph?.total??graph?.nodes.length??0);
  useEffect(()=>{document.body.dataset.mode='graphs';return()=>{delete document.body.dataset.mode}},[]);
  useEffect(()=>{document.body.classList.toggle('graph-immersive',immersive);return()=>document.body.classList.remove('graph-immersive')},[immersive]);
  useEffect(()=>{actions.setSceneState({visibleLayers:mode==='evidence'?['evidence','provenance']:mode==='relations'?['hierarchy','relations','evidence']:['hierarchy','relations'],expandedRelations:mode==='relations'?['related','supports','contradicts','dependency']:[]})},[actions,mode]);
  void reducedMotion;void compact;

  const baseProjection=useMemo(()=>graph?buildLiveProjection({graph,focusId:state.focusId,path:state.path,pins:state.pins,compare:state.compare}):null,[graph,state.focusId,state.path,state.pins,state.compare]);
  const projection=useMemo(()=>baseProjection?modeProjection(baseProjection,mode):null,[baseProjection,mode]);
  const selected=graph?.nodes.find(node=>node.id===state.selectedId)||null;
  const canBack=state.navigationIndex>0;
  const canForward=state.navigationIndex<state.navigationStack.length-1;

  const projectedNode=(id:string)=>projection?.nodes.find(node=>node.id===id)||baseProjection?.nodes.find(node=>node.id===id)||null;
  const rawNode=(id:string)=>graph?.nodes.find(node=>node.id===id)||null;
  const select=(id:string|null)=>{if(!id){actions.clearSelection();return}const raw=rawNode(id);if(raw)actions.select(raw)};
  const open=(id:string)=>{
    const projected=projectedNode(id);const raw=rawNode(id);
    if(raw){actions.open({...raw,navigationKind:projected?.navigationKind} as AtlasNode);return}
    if(projected?.syntheticContext)void actions.focusSystem(projected.id,projected.label);
  };
  const breadcrumb=(node:GraphNode)=>void actions.focusSystem(node.id,node.label);
  const selectedPinned=Boolean(state.selectedId&&state.pins.includes(state.selectedId));
  const selectedCompared=Boolean(state.selectedId&&state.compare.includes(state.selectedId));

  return <div className={`page-wrap graphs-page spatial-knowledge-page ${immersive?'is-immersive':''}`}>
    <section className="graph-workspace spatial-workspace" id="map-workspace">
      <div className="spatial-top-hud">
        <nav className="reference-breadcrumbs spatial-breadcrumbs" aria-label="Navegação hierárquica">
          {baseProjection?.breadcrumbs.map((item,index)=><span key={item.id}>{index>0&&<i>/</i>}<button onClick={()=>breadcrumb({id:item.id,label:item.label,type:'CONTEXT'})}>{item.label}</button></span>)}
        </nav>
        <div className="spatial-mode-switch" aria-label="Modo do grafo">
          {(['explore','relations','evidence'] as const).map(value=><button key={value} className={mode===value?'active':''} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='explore'?'Explore':value==='relations'?'Relations':'Evidence'}</button>)}
        </div>
      </div>

      <div className="graph-stage spatial-stage">
        {projection?<GraphRenderer projection={projection} learning={false} selectedId={state.selectedId} onSelect={select} onOpenNode={open}/>:<div className="graph-empty-state"><span aria-hidden="true">∅</span><p>{state.loading?'Lendo mapa de conhecimento…':'Grafo indisponível neste momento.'}</p><small>{state.error||'Nenhum recorte válido foi publicado.'}</small></div>}
        <div className="spatial-navigation-hud" aria-label="Controles de navegação">
          <button onClick={()=>void actions.back()} disabled={!canBack} title="Voltar" aria-label="Voltar">←</button>
          <button onClick={()=>void actions.forward()} disabled={!canForward} title="Avançar" aria-label="Avançar">→</button>
          <button onClick={()=>void actions.home()} title="Início" aria-label="Início">⌂</button>
          <label>LOD <select value={depth} aria-label="Profundidade semântica" onChange={event=>{const next=Number(event.target.value);setDepth(next);actions.setDepth(next)}}><option value={1}>Macro</option><option value={2}>Meso</option><option value={3}>Micro</option><option value={4}>Detail</option></select></label>
          <button onClick={()=>setImmersive(value=>!value)} aria-pressed={immersive} title="Modo imersivo" aria-label="Modo imersivo">{immersive?'□':'⛶'}</button>
        </div>
        {state.error&&<div className="atlas-react-error spatial-stale-state" role="status">STALE · último recorte válido preservado · {state.error}</div>}
      </div>

      <footer className="spatial-context-strip">
        <span><b>{projection?.nodes.length||0}</b> / {total||projection?.nodes.length||0} nós</span>
        <span><b>{projection?.edges.length||0}</b> relações visíveis</span>
        <span><b>{state.path.at(-1)?.label||state.focusId}</b> foco</span>
        <span><b>{state.pins.length}</b> pins</span>
        <span><b>{state.compare.length}/2</b> compare</span>
        {state.selectedId?<div className="spatial-selection-actions"><span>{selected?.label||state.selectedId}</span><button onClick={()=>selectedPinned?actions.unpin(state.selectedId!):actions.pin(state.selectedId!)}>{selectedPinned?'Unpin':'Pin'}</button><button className={selectedCompared?'active':''} onClick={()=>actions.toggleCompare(state.selectedId!)}>Compare</button><button onClick={actions.clearSelection}>×</button></div>:<span className="spatial-selection-empty">Selecione um nó para investigar.</span>}
        {(graph?.hasMore||graph?.truncated)&&<button id="more" type="button" onClick={()=>void actions.more()}>Mais entidades</button>}
      </footer>
    </section>
  </div>;
}
