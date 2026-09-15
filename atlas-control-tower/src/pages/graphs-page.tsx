import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {AtlasContextBar} from '../components/AtlasContextBar';
import {GraphRenderer} from '../graph-engine/GraphRenderer';
import {SpatialInspector} from '../graph-engine/SpatialInspector';
import {AccessibleGraphTable} from '../graph-engine/AccessibleGraphTable';
import {GraphHeader} from '../components/shell/GraphHeader';
import {MapFilters} from '../components/shell/MapFilters';
import {applyMapFilters,distinctAuthorityValues,distinctFieldValues,type MapFilters as MapFilterState} from '../graph-engine/graph-filters';
import {buildLiveProjection} from '../graph-engine/live-projection';
import {enforceGraphEntityContract} from '../graph-engine/graph-entity-contract';
import {supportsWebGL2,resolveMapRenderMode} from '../graph-engine/webgl-support';
import {zoomStep} from '../graph-engine/orbital-2_5d-layout';
import type {GraphNode} from '../graph-engine/types';
import type {AtlasNode} from '../scene/types';
import type {AtlasActions,AtlasUiState} from '../state/useAtlasSession';

type GraphMode='structure'|'evidence'|'synthesis';
export type ObservatoryProductMode=GraphMode;
const EVIDENCE_TYPES=new Set(['HYPOTHESIS','TEST','RUN','RESULT','EVIDENCE','CLAIM','DOCUMENT','PUBLICATION']);

function modeProjection(projection:ReturnType<typeof buildLiveProjection>,mode:GraphMode){
  if(mode!=='evidence')return projection;
  const keep=new Set(projection.nodes.filter(node=>node.id===projection.focusId||node.contextRole==='ancestor'||node.contextRole==='portal'||EVIDENCE_TYPES.has(node.type.toUpperCase())).map(node=>node.id));
  return {...projection,nodes:projection.nodes.filter(node=>keep.has(node.id)),edges:projection.edges.filter(edge=>keep.has(edge.source)&&keep.has(edge.target))};
}

type GraphsPageProps={
  state:AtlasUiState;
  actions:AtlasActions;
  reducedMotion:boolean;
  compact:boolean;
  initialProductMode?:ObservatoryProductMode;
  synthesisOverlay?:ReactNode;
};

export function GraphsPage({state,actions,reducedMotion,compact,initialProductMode='structure',synthesisOverlay}:GraphsPageProps){
  const [depth,setDepth]=useState(1);
  const [mode,setMode]=useState<GraphMode>(initialProductMode);
  const [relationsExpanded,setRelationsExpanded]=useState(false);
  const [immersive,setImmersive]=useState(false);
  const [webgl2Supported]=useState(()=>supportsWebGL2());
  const [contextLost,setContextLost]=useState(false);
  const [zoom,setZoom]=useState(1);
  const [mapFilters,setMapFilters]=useState<MapFilterState>({});
  const stageRef=useRef<HTMLDivElement>(null);

  useEffect(()=>setMode(initialProductMode),[initialProductMode]);
  useEffect(()=>{
    const onLost=(event:Event)=>{event.preventDefault();setContextLost(true)};
    const onRestored=()=>{};
    document.addEventListener('webglcontextlost',onLost,true);
    document.addEventListener('webglcontextrestored',onRestored,true);
    return()=>{document.removeEventListener('webglcontextlost',onLost,true);document.removeEventListener('webglcontextrestored',onRestored,true)};
  },[]);

  const renderMode=resolveMapRenderMode({webgl2Supported,contextLost});
  const graph=state.graph;
  const total=Number(graph?.visualTotal??graph?.total??graph?.nodes.length??0);
  useEffect(()=>{document.body.dataset.mode='observatory';return()=>{delete document.body.dataset.mode}},[]);
  useEffect(()=>{setMapFilters({})},[state.focusId]);
  useEffect(()=>{document.body.classList.toggle('graph-immersive',immersive);return()=>document.body.classList.remove('graph-immersive')},[immersive]);
  useEffect(()=>{
    const visibleLayers=mode==='evidence'?['evidence','provenance']:relationsExpanded?['hierarchy','relations','evidence']:['hierarchy','relations'];
    actions.setSceneState({visibleLayers,expandedRelations:relationsExpanded?['related','supports','contradicts','dependency']:[]});
  },[actions,mode,relationsExpanded]);
  void reducedMotion;void compact;

  const liveProjection=useMemo(()=>graph?buildLiveProjection({graph,focusId:state.focusId,path:state.path,pins:state.pins,compare:state.compare}):null,[graph,state.focusId,state.path,state.pins,state.compare]);
  const lastLoggedIssuesRef=useRef('');
  const baseProjection=useMemo(()=>{
    if(!liveProjection)return null;
    const {projection,issues}=enforceGraphEntityContract(liveProjection);
    if(issues.length){
      const signature=JSON.stringify(issues);
      if(lastLoggedIssuesRef.current!==signature){lastLoggedIssuesRef.current=signature;console.debug('[atlas:graph-contract]',issues)}
    }
    return projection;
  },[liveProjection]);
  const modeFilteredProjection=useMemo(()=>baseProjection?modeProjection(baseProjection,mode):null,[baseProjection,mode]);
  const authorityById=useMemo(()=>new Map((graph?.nodes||[]).map(node=>[node.id,typeof node.authority==='string'?node.authority:undefined])),[graph]);
  const domainOptions=useMemo(()=>baseProjection?distinctFieldValues(baseProjection.nodes,'domain'):[],[baseProjection]);
  const statusOptions=useMemo(()=>baseProjection?distinctFieldValues(baseProjection.nodes,'status'):[],[baseProjection]);
  const authorityOptions=useMemo(()=>distinctAuthorityValues(authorityById),[authorityById]);
  const projection=useMemo(()=>modeFilteredProjection?applyMapFilters(modeFilteredProjection,mapFilters,authorityById):null,[modeFilteredProjection,mapFilters,authorityById]);
  const filtersActive=Boolean(mapFilters.domain||mapFilters.status||mapFilters.authority);
  const filteredToEmpty=filtersActive&&Boolean(projection)&&projection!.nodes.length<=1;
  const selected=graph?.nodes.find(node=>node.id===state.selectedId)||null;
  const canBack=state.navigationIndex>0;
  const canForward=state.navigationIndex<state.navigationStack.length-1;
  const navigationKind=String(state.navigationStack[state.navigationIndex]?.navigationKind||'drill-down');
  const contextFreshness=state.health?.dataSource?.freshness||state.summary?.projection?.freshness||projection?.freshness||'UNKNOWN';
  const contextAuthority=state.health?.dataSource?.authority||null;
  const contextSourceVersion=state.health?.dataSource?.sourceVersion||state.summary?.projection?.sourceVersion||state.health?.sourceVersion||null;

  const projectedNode=(id:string)=>projection?.nodes.find(node=>node.id===id)||baseProjection?.nodes.find(node=>node.id===id)||null;
  const rawNode=(id:string)=>graph?.nodes.find(node=>node.id===id)||null;
  const select=(id:string|null)=>{if(!id){actions.clearSelection();return}const raw=rawNode(id);if(raw)actions.select(raw)};
  const open=(id:string)=>{
    const projected=projectedNode(id);const raw=rawNode(id);
    if(raw){void actions.open({...raw,navigationKind:projected?.navigationKind} as AtlasNode);return}
    if(projected?.syntheticContext)void actions.focusSystem(projected.id,projected.label);
  };
  const breadcrumb=(node:GraphNode)=>void actions.focusSystem(node.id,node.label);
  const selectedPinned=Boolean(state.selectedId&&state.pins.includes(state.selectedId));
  const selectedCompared=Boolean(state.selectedId&&state.compare.includes(state.selectedId));

  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      const tag=(event.target as HTMLElement|null)?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
      if(event.altKey&&event.key==='ArrowLeft'&&canBack){event.preventDefault();void actions.back();return}
      if(event.altKey&&event.key==='ArrowRight'&&canForward){event.preventDefault();void actions.forward();return}
      if(event.key==='Backspace'&&canBack){event.preventDefault();void actions.back();return}
      if(event.key==='Escape'){actions.clearSelection();return}
      if(event.key==='Enter'&&state.selectedId){event.preventDefault();open(state.selectedId);return}
      if(event.key.toLowerCase()==='f'&&!event.metaKey&&!event.ctrlKey){event.preventDefault();setImmersive(value=>!value)}
    };
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);
  },[actions,canBack,canForward,state.selectedId,projection,baseProjection]);

  return <div className={`page-wrap graphs-page unified-observatory spatial-knowledge-page ${immersive?'is-immersive':''}`}>
    <section className="graph-workspace spatial-workspace" id="map-workspace">
      <div className="atlas-context-bar-slot">
        <AtlasContextBar path={state.path} freshness={contextFreshness} authority={contextAuthority} sourceVersion={contextSourceVersion} navigationKind={navigationKind}/>
      </div>
      <div className="spatial-top-hud">
        <nav className="reference-breadcrumbs spatial-breadcrumbs" aria-label="Navegação hierárquica">
          {baseProjection?.breadcrumbs.map((item,index)=><span key={item.id}>{index>0&&<i>/</i>}<button onClick={()=>breadcrumb({id:item.id,label:item.label,type:'CONTEXT'})}>{item.label}</button></span>)}
        </nav>
        <div className="observatory-view-controls">
          <div className="spatial-mode-switch" aria-label="Modo do Observatório">
            {(['structure','evidence','synthesis'] as const).map(value=><button key={value} className={mode===value?'active':''} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='structure'?'Estrutura':value==='evidence'?'Evidência':'Síntese'}</button>)}
          </div>
          <button className={`observatory-relations-toggle ${relationsExpanded?'active':''}`} aria-pressed={relationsExpanded} onClick={()=>setRelationsExpanded(value=>!value)}>Relações</button>
        </div>
      </div>

      <GraphHeader onReset={()=>void actions.home()} zoom={zoom} onZoomIn={()=>setZoom(current=>zoomStep(current,1))} onZoomOut={()=>setZoom(current=>zoomStep(current,-1))} fullscreenTargetRef={stageRef}/>

      <MapFilters filters={mapFilters} domainOptions={domainOptions} statusOptions={statusOptions} authorityOptions={authorityOptions} onChange={setMapFilters} onClear={()=>setMapFilters({})}/>

      <div className="graph-stage spatial-stage" ref={stageRef}>
        {!projection?<div className="graph-empty-state"><span aria-hidden="true">∅</span><p>{state.loading?'Lendo mapa de conhecimento…':'Observatório indisponível neste momento.'}</p><small>{state.error||'Nenhum recorte válido foi publicado.'}</small></div>
          :filteredToEmpty?<div className="graph-empty-state"><span aria-hidden="true">∅</span><p>Nenhum nó corresponde aos filtros atuais.</p><small><button type="button" className="map-filter-clear" onClick={()=>setMapFilters({})}>Limpar filtros</button></small></div>
          :renderMode==='table'?<AccessibleGraphTable projection={projection} selectedId={state.selectedId} onSelect={select}/>
          :<GraphRenderer projection={projection} learning={false} selectedId={state.selectedId} onSelect={select} onOpenNode={open} zoom={zoom} onZoomChange={setZoom}/>}
        {mode==='synthesis'&&synthesisOverlay&&<aside className="observatory-synthesis-overlay" aria-label="Síntese científica publicada">{synthesisOverlay}</aside>}
        {state.loading && projection && <div className="graph-stage-status" role="status" aria-live="polite"><span className="graph-stage-status-dot" aria-hidden="true"/><span>Preparando o próximo recorte…</span></div>}
        <SpatialInspector state={state} actions={actions} projection={projection} onOpen={open}/>
        <div className="spatial-navigation-hud" aria-label="Controles de navegação">
          <button onClick={()=>void actions.back()} disabled={!canBack} title="Voltar · Alt+←" aria-label="Voltar">←</button>
          <button onClick={()=>void actions.forward()} disabled={!canForward} title="Avançar · Alt+→" aria-label="Avançar">→</button>
          <button onClick={()=>void actions.home()} title="Início" aria-label="Início">⌂</button>
          <label>NÍVEL <select value={depth} aria-label="Profundidade semântica" onChange={event=>{const next=Number(event.target.value);setDepth(next);actions.setDepth(next)}}><option value={1}>Macro</option><option value={2}>Meso</option><option value={3}>Micro</option><option value={4}>Detalhe</option></select></label>
          <button onClick={()=>setImmersive(value=>!value)} aria-pressed={immersive} title="Modo imersivo · F" aria-label="Modo imersivo">{immersive?'□':'⛶'}</button>
        </div>
        {state.error&&graph&&<div className="atlas-react-error spatial-stale-state" role="status">STALE · último recorte válido preservado · {state.error}</div>}
      </div>

      <footer className="spatial-context-strip">
        <span><b>{projection?.nodes.length||0}</b> / {total||projection?.nodes.length||0} nós</span>
        <span><b>{projection?.edges.length||0}</b> relações visíveis</span>
        <span><b>{state.path.at(-1)?.label||state.focusId}</b> foco</span>
        <span className={navigationKind==='cross-domain'?'jump':'drill'}><b>{navigationKind==='cross-domain'?'SALTO ENTRE DOMÍNIOS':'ABRIR SUBGRAFO'}</b></span>
        <span><b>{state.pins.length}</b> fixados</span>
        <span><b>{state.compare.length}/2</b> comparação</span>
        {state.selectedId?<div className="spatial-selection-actions"><span>{selected?.label||state.selectedId}</span><button onClick={()=>selectedPinned?actions.unpin(state.selectedId!):actions.pin(state.selectedId!)}>{selectedPinned?'Desafixar':'Fixar'}</button><button className={selectedCompared?'active':''} onClick={()=>actions.toggleCompare(state.selectedId!)}>Comparar</button><button onClick={actions.clearSelection}>×</button></div>:<span className="spatial-selection-empty">Selecione um nó para investigar.</span>}
        {(graph?.hasMore||graph?.truncated)&&<button id="more" type="button" onClick={()=>void actions.more()}>Mais entidades</button>}
      </footer>
    </section>
  </div>;
}