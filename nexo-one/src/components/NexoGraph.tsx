import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {MetroAtlasRenderer} from '../atlas3d/MetroAtlasRenderer.tsx';
import {GalaxyView} from '../atlas3d/GalaxyView.tsx';
import {ensureAtlasG6} from '../atlas3d/g6-loader.ts';
import {visibleAtlasIds,type AtlasGraphLayer,type AtlasMetroModel} from '../atlas3d/atlasAdapter.ts';
import './NexoGraph.css';

export type NexoGraphView='2d'|'3d'|'galaxy';
const ALL_GRAPH_LAYERS=new Set<AtlasGraphLayer>(['knowledge','execution','capability']);

export function GraphViewSwitch({view,onChange}:{view:NexoGraphView;onChange:(view:NexoGraphView)=>void}){
  return <div className="nexo-graph-view-switch" role="group" aria-label="Visualização do grafo">
    <button type="button" className={view==='2d'?'active':''} aria-pressed={view==='2d'} onClick={()=>onChange('2d')}>2D</button>
    <button type="button" className={view==='3d'?'active':''} aria-pressed={view==='3d'} onClick={()=>onChange('3d')}>3D</button>
    <button type="button" className={view==='galaxy'?'active':''} aria-pressed={view==='galaxy'} onClick={()=>onChange('galaxy')}>Galáxia</button>
  </div>;
}

export function NexoGraph({
  model,expanded,visibleLayers=ALL_GRAPH_LAYERS,selectedId,view,theme='dark',showRelations=true,fitNonce=0,onSelect,onViewChange,onFit,onReset,onReady,toolbarContext,toolbarFilters,showViewSwitch=true,
}:{
  model:AtlasMetroModel;expanded:ReadonlySet<string>;visibleLayers?:ReadonlySet<AtlasGraphLayer>;selectedId:string|null;view:NexoGraphView;theme?:'dark'|'light';
  showRelations?:boolean;fitNonce?:number;onSelect:(id:string)=>void;onViewChange:(view:NexoGraphView)=>void;
  onFit?:()=>void;onReset?:()=>void;onReady?:()=>void;toolbarContext?:ReactNode;toolbarFilters?:ReactNode;
  showViewSwitch?:boolean;
}){
  const hostRef=useRef<HTMLDivElement|null>(null);
  const [g6Ready,setG6Ready]=useState(()=>view==='3d'||Boolean((window as any).G6?.Graph));
  const [tableMode,setTableMode]=useState(false);
  const [spotlight,setSpotlight]=useState(true);
  const [illuminated,setIlluminated]=useState(false);
  const visible=useMemo(()=>visibleAtlasIds(model,expanded,visibleLayers),[model.revision,expanded,visibleLayers]);
  const visibleSet=useMemo(()=>new Set(visible),[visible]);
  const rows=useMemo(()=>visible.map(id=>model.nodeMap.get(id)).filter(Boolean),[visible,model]);
  const relationCount=useMemo(()=>model.crossLinks.filter(link=>visibleSet.has(link.source)&&visibleSet.has(link.target)).length,[model.crossLinks,visibleSet]);

  useEffect(()=>{
    if(view!=='2d'){setG6Ready(true);return;}
    let active=true;
    void ensureAtlasG6().then(()=>{if(active)setG6Ready(true);}).catch(()=>{if(active)setG6Ready(false);});
    return()=>{active=false;};
  },[view]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(target&&/INPUT|TEXTAREA|SELECT/.test(target.tagName))return;
      if(event.key==='2')onViewChange('2d');
      if(event.key==='3')onViewChange('3d');
      if(event.key==='g')onViewChange('galaxy');
      if(event.key==='Escape'&&selectedId)hostRef.current?.focus();
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[onViewChange,selectedId]);

  const fullscreen=()=>{
    const node=hostRef.current;
    if(!node)return;
    if(document.fullscreenElement)void document.exitFullscreen();
    else void node.requestFullscreen?.();
  };

  const count=<div className="nexo-graph-count"><strong>{visible.length}</strong> visíveis · <span>{model.nodes.length} total</span> · <span>{relationCount} relações</span></div>;
  const spotlightActive=spotlight&&Boolean(selectedId);
  const spotlightToggle=!tableMode&&<button type="button" className="nexo-spotlight-toggle" aria-label={spotlightActive?"Desativar foco visual no nó selecionado":"Ativar foco visual no nó selecionado"} aria-pressed={spotlightActive} disabled={!selectedId} title={selectedId?(spotlightActive?"Mostrar todo o grafo com o mesmo peso":"Destacar o nó selecionado e sua vizinhança"):"Selecione um nó para ativar o foco"} onClick={()=>setSpotlight(value=>!value)}>{spotlightActive?'Foco ativo':'Focar seleção'}</button>;
  const illuminationToggle=!tableMode&&<button type="button" className="nexo-illumination-toggle" aria-label={illuminated?"Desativar iluminação global":"Iluminar todos os nós e relações"} aria-pressed={illuminated} title={illuminated?"Desativar iluminação global":"Iluminar todos os nós e relações"} onClick={()=>setIlluminated(value=>!value)}>{illuminated?'Apagar iluminação':'Iluminar tudo'}</button>;
  return <section ref={hostRef} tabIndex={-1} className="nexo-graph" data-graph-view={view} data-graph-illuminated={illuminated} data-graph-visible={visible.length} data-graph-total={model.nodes.length} data-toolbar-rows={toolbarFilters?2:1}>
    <div className="nexo-graph-toolbar">
      <div className="nexo-graph-toolbar-row nexo-graph-toolbar-primary">
        <div className="nexo-graph-toolbar-context">{toolbarContext||(!toolbarFilters&&count)}</div>
        <div className="nexo-graph-actions">
          {showViewSwitch&&<GraphViewSwitch view={view} onChange={onViewChange}/>}
          {!toolbarFilters&&spotlightToggle}
          {!toolbarFilters&&illuminationToggle}
          {onFit&&<button type="button" onClick={onFit}>Enquadrar</button>}
          {onReset&&<button type="button" onClick={onReset}>Resetar</button>}
          <button type="button" onClick={fullscreen}>Tela cheia</button>
          <button type="button" aria-pressed={tableMode} onClick={()=>setTableMode(value=>!value)}>{tableMode?'Ver grafo':'Ver como tabela'}</button>
        </div>
      </div>
      {toolbarFilters&&<div className="nexo-graph-toolbar-row nexo-graph-toolbar-secondary">
        <div className="nexo-graph-filters">
          {spotlightToggle}
          {illuminationToggle}
          {toolbarFilters}
        </div>
        {count}
      </div>}
    </div>
    {tableMode
      ? <div className="nexo-graph-table-wrap"><table className="nexo-graph-table"><thead><tr><th>Entidade</th><th>Tipo</th><th>Domínio</th><th>Estado</th><th>Relações</th></tr></thead><tbody>{rows.map(node=><tr key={node!.id} className={node!.id===selectedId?'selected':''} onClick={()=>onSelect(node!.id)}><td><strong>{node!.name}</strong><small>{node!.id}</small></td><td>{node!.entityType}</td><td>{node!.domain}</td><td>{node!.status}</td><td>{node!.relationCount}</td></tr>)}</tbody></table></div>
      : view==='galaxy'
        ? <GalaxyView selectedId={selectedId} onSelect={onSelect}/>
      : view==='2d'&&!g6Ready
        ? <div className="nexo-graph-fallback" role="status">2D indisponível neste instante. Os dados continuam acessíveis em tabela.</div>
        : <MetroAtlasRenderer model={model} expanded={expanded} visibleLayers={visibleLayers} selectedId={spotlightActive?selectedId:null} showBeams={showRelations} viewMode={view} theme={theme} fitNonce={fitNonce} allIlluminated={illuminated} onActivate={onSelect} onReady={onReady}/>}
  </section>;
}
