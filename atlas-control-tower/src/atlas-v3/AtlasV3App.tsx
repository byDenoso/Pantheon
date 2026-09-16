import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {routeFor} from '../atlas-route';
import {AtlasCanvas} from '../scene/AtlasCanvas';
import type {AtlasGraph,AtlasNode} from '../scene/types';
import {loadAtlasV3Snapshot} from './projection-loader.mjs';
import {ATLAS_V3_PRESENTATION_ROOT,buildAtlasV3Scene} from './scene-adapter.mjs';
import type {AtlasV3Layer,AtlasV3Scene,AtlasV3Snapshot} from './types';
import {persistThemeMode,readThemeMode,resolveTheme} from './theme-mode.mjs';
import {buildHealthLayerModel} from './health-layer-model.mjs';
import {PRIMARY_DOMAINS,OVERLAYS,buildSemanticVisibility,diffSnapshots,semanticDepthForNode} from './semantic-v4.mjs';
import {readAtlasSession,writeAtlasSession} from './session-v4.mjs';
import './atlas-v3.css';
import './atlas-v3-theme.css';

type ThemeMode='system'|'light'|'dark';
type PrimaryDomain='NEXO'|'SCIENCE'|'OPERATIONS'|'HEALTH';
type Overlay='LEARNING'|'AUTOMATIONS'|'EVIDENCE';
type SnapshotDiff={added:string[];removed:string[];updated:string[]};

// Kept as a compatibility declaration for the V3 projection contract. V4 no longer
// presents all six as competing primary destinations.
const LAYERS:AtlasV3Layer[]=['NEXO','SCIENCE','OPERATIONS','HEALTH','AUTOMATIONS','EVIDENCES'];
void LAYERS;
const DOMAIN_LABELS:Record<PrimaryDomain,string>={NEXO:'Nexo',SCIENCE:'Science',OPERATIONS:'Operations',HEALTH:'Health'};
const OVERLAY_LABELS:Record<Overlay,string>={LEARNING:'Learning',AUTOMATIONS:'Automations',EVIDENCE:'Evidence'};

function useMedia(query:string){
  const [matches,setMatches]=useState(()=>typeof window!=='undefined'&&window.matchMedia(query).matches);
  useEffect(()=>{const media=window.matchMedia(query);const update=()=>setMatches(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[query]);
  return matches;
}
function short(value:unknown,max=52){const text=String(value??'');return text.length>max?`${text.slice(0,max-1)}…`:text}
function displayLabel(node?:AtlasNode|null){return short(node?.label||String(node?.id||'Sem seleção'),42)}
function primaryDomainForNode(node:AtlasNode,current:PrimaryDomain):PrimaryDomain{
  const type=String(node.type||'').toUpperCase();const domain=String(node.domain||'').toUpperCase();
  if(domain.includes('OLYMPUS'))return'HEALTH';
  if(type==='WORK'||type==='ACTION')return'OPERATIONS';
  if(type==='FILAMENT'||type==='AUTOMATION'||type==='REFERENCE'||type==='EVIDENCE')return current;
  return'SCIENCE';
}
function overlayForNode(node:AtlasNode):Overlay|null{
  const type=String(node.type||'').toUpperCase();
  if(type==='FILAMENT')return'LEARNING';
  if(type==='AUTOMATION')return'AUTOMATIONS';
  if(type==='REFERENCE'||type==='EVIDENCE')return'EVIDENCE';
  return null;
}
function connectedToTypes(graph:AtlasGraph,types:Set<string>){
  const seeds=new Set(graph.nodes.filter(node=>types.has(String(node.type||'').toUpperCase())).map(node=>node.id));const visible=new Set(seeds);
  for(const edge of graph.edges)if(seeds.has(edge.source)||seeds.has(edge.target)){visible.add(edge.source);visible.add(edge.target)}
  return visible;
}
function nodeVisibleForLayer(node:AtlasNode,layer:AtlasV3Layer,connected:Set<string>){
  if(node.presentationOnly)return true;
  const type=String(node.type||'').toUpperCase();const domain=String(node.domain||'').toUpperCase();
  if(layer==='NEXO')return true;
  if(layer==='SCIENCE')return !['WORK','REFERENCE','EVIDENCE','FILAMENT','AUTOMATION'].includes(type);
  if(layer==='AUTOMATIONS'||layer==='LEARNING')return connected.has(node.id)||type==='FILAMENT'||type==='AUTOMATION';
  if(layer==='OPERATIONS')return connected.has(node.id)||type==='WORK'||type==='ACTION';
  if(layer==='EVIDENCES'||layer==='EVIDENCE'||layer==='PROVENANCE')return connected.has(node.id)||type==='REFERENCE'||type==='EVIDENCE';
  if(layer==='HEALTH')return domain.includes('OLYMPUS')||type==='SYSTEM'||type==='WORK';
  return true;
}
function graphForLayer(scene:AtlasV3Scene,layer:AtlasV3Layer):AtlasGraph{
  const types=layer==='AUTOMATIONS'||layer==='LEARNING'?new Set(['FILAMENT','AUTOMATION']):layer==='OPERATIONS'?new Set(['WORK','ACTION']):layer==='EVIDENCES'||layer==='EVIDENCE'||layer==='PROVENANCE'?new Set(['REFERENCE','EVIDENCE']):layer==='HEALTH'?new Set(['WORK','SYSTEM']):new Set<string>();
  const connected=types.size?connectedToTypes(scene.graph,types):new Set(scene.graph.nodes.map(node=>node.id));
  const nodes=scene.graph.nodes.filter(node=>nodeVisibleForLayer(node,layer,connected));const ids=new Set(nodes.map(node=>node.id));const edges=scene.graph.edges.filter(edge=>ids.has(edge.source)&&ids.has(edge.target));
  return{...scene.graph,nodes,edges,visualTotal:nodes.length};
}
function graphForContext(scene:AtlasV3Scene,domain:PrimaryDomain,overlays:Overlay[]):AtlasGraph{
  const base=graphForLayer(scene,domain);const ids=new Set(base.nodes.map(node=>node.id));
  const includeTypes=new Set<string>();
  if(overlays.includes('LEARNING'))includeTypes.add('FILAMENT');
  if(overlays.includes('AUTOMATIONS'))includeTypes.add('AUTOMATION');
  if(overlays.includes('EVIDENCE')){includeTypes.add('REFERENCE');includeTypes.add('EVIDENCE')}
  if(includeTypes.size){
    const overlayIds=connectedToTypes(scene.graph,includeTypes);
    for(const id of overlayIds)ids.add(id);
  }
  const nodes=scene.graph.nodes.filter(node=>ids.has(node.id));const visible=new Set(nodes.map(node=>node.id));const edges=scene.graph.edges.filter(edge=>visible.has(edge.source)&&visible.has(edge.target));
  return{...scene.graph,nodes,edges,visualTotal:nodes.length};
}
function HealthLayerPanel({snapshot}:{snapshot:AtlasV3Snapshot}){
  const model=buildHealthLayerModel(snapshot);
  return <section className={`health-layer-panel health-layer-panel--${model.status.toLowerCase()}`} aria-label="Saúde sincronizada com Olympus"><div><span>HEALTH / OLYMPUS</span><h2>{model.label}</h2></div><strong>{model.status}</strong><dl><div><dt>Versão</dt><dd>{model.sourceVersion}</dd></div><div><dt>Registros públicos</dt><dd>{model.publicEntityCount}</dd></div><div><dt>Dados privados</dt><dd>{model.privateDataExcluded?'excluídos':'não confirmado'}</dd></div></dl><small>Leitura sanitizada autorizada pelo TOWER_V06. A aba não publica dados pessoais, clínicos ou de clientes.</small></section>;
}
function Inspector({node,snapshot,onClose,compact}:{node:AtlasNode|null;snapshot:AtlasV3Snapshot;onClose:()=>void;compact:boolean}){
  const entity=node&&!node.presentationOnly?snapshot.entities?.[node.id]:null;const kind=node?.presentationOnly?'APRESENTAÇÃO':'CANONICAL';const summary=typeof node?.summary==='string'?node.summary:typeof entity?.summary==='string'?String(entity.summary):typeof entity?.description==='string'?String(entity.description):'';const nextMove=typeof entity?.nextAction==='string'?String(entity.nextAction):typeof entity?.next_action==='string'?String(entity.next_action):'';const campaignTestsHref=node&&String(node.type||'').toUpperCase()==='CAMPAIGN'?routeFor('lab',{entity:node.id,kind:'TEST'}):null;
  return <aside id="atlas-v3-inspector" role={compact?'dialog':'complementary'} className="inspector-sheet is-open" aria-modal={compact?true:undefined} aria-label="Inspector do Atlas"><div className="inspector-grab" aria-hidden="true"/><header className="inspector-head"><div><span>{kind}</span><h2>{node?displayLabel(node):'Selecione um nó'}</h2></div><button className="icon-button inspector-close" type="button" onClick={onClose} aria-label="Fechar inspector">×</button></header><div className="inspector-body">{node?<><div className="inspector-grid"><span>tipo<b>{String(node.type||'—')}</b></span><span>status<b>{String(node.status||'—')}</b></span><span>domínio<b>{String(node.domain||'—')}</b></span><span>origem<b>{node.presentationOnly?'visual':'TOWER_V06'}</b></span></div>{summary&&<section className="inspector-context"><span>Resumo</span><p>{summary}</p></section>}{nextMove&&<section className="inspector-context inspector-context--next"><span>Próximo movimento</span><p>{nextMove}</p></section>}<p className="canonical-id">{node.id}</p>{campaignTestsHref&&<a className="campaign-tests-link" href={campaignTestsHref}>Acessar testes →</a>}{entity&&<dl className="entity-fields">{Object.entries(entity).filter(([key])=>!['id','label','summary','description','nextAction','next_action'].includes(key)).slice(0,8).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{Array.isArray(value)?value.join(', '):String(value??'—')}</dd></div>)}</dl>}</>:<p className="inspector-empty">Toque ou clique em uma entidade. O painel mostra somente o que existe na projeção publicada.</p>}</div></aside>;
}

export type AtlasNeuralSurfaceProps={compact?:boolean;initialLayer?:AtlasV3Layer;embedded?:boolean;onOpenEntity?:(node:AtlasNode)=>void};

export function AtlasV3App({compact:compactProp,initialLayer='SCIENCE',embedded=false,onOpenEntity}:AtlasNeuralSurfaceProps={}){
  const compactMedia=useMedia('(max-width: 760px)');const compact=compactProp??compactMedia;const reducedMotion=useMedia('(prefers-reduced-motion: reduce)');const systemDark=useMedia('(prefers-color-scheme: dark)');
  const restored=useMemo(()=>typeof window==='undefined'?null:readAtlasSession(window.sessionStorage),[]);
  const initialDomain:PrimaryDomain=(restored?.domain&&PRIMARY_DOMAINS.includes(restored.domain)?restored.domain:PRIMARY_DOMAINS.includes(initialLayer)?initialLayer:'SCIENCE') as PrimaryDomain;
  const [themeMode,setThemeMode]=useState<ThemeMode>(()=>readThemeMode() as ThemeMode);const resolvedTheme:'dark'|'light'=resolveTheme(themeMode,systemDark) as 'dark'|'light';
  const [snapshot,setSnapshot]=useState<AtlasV3Snapshot|null>(null);const [scene,setScene]=useState<AtlasV3Scene|null>(null);const snapshotRef=useRef<AtlasV3Snapshot|null>(null);const sceneRef=useRef<AtlasV3Scene|null>(null);
  const [primaryDomain,setPrimaryDomain]=useState<PrimaryDomain>(initialDomain);const [overlays,setOverlays]=useState<Overlay[]>(()=>Array.isArray(restored?.overlays)?restored.overlays.filter((item:string)=>OVERLAYS.includes(item)) as Overlay[]:[]);
  const [focusId,setFocusId]=useState(restored?.focusId||ATLAS_V3_PRESENTATION_ROOT);const [focusHistory,setFocusHistory]=useState<string[]>([]);const [selectedId,setSelectedId]=useState<string|null>(restored?.selectedId||null);const [query,setQuery]=useState('');const [searchOpen,setSearchOpen]=useState(false);const [inspectorOpen,setInspectorOpen]=useState(false);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [stale,setStale]=useState(false);const [syncDiff,setSyncDiff]=useState<SnapshotDiff|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const result=await loadAtlasV3Snapshot(embedded?new URL('atlas-v3/',window.location.href).href:window.location.href);const nextScene=buildAtlasV3Scene(result.snapshot);const previous=snapshotRef.current;
      setSyncDiff(previous?diffSnapshots(previous,result.snapshot):null);snapshotRef.current=result.snapshot;sceneRef.current=nextScene;setSnapshot(result.snapshot);setScene(nextScene);setStale(false);
      setFocusId(current=>nextScene.graph.nodes.some(node=>node.id===current)?current:nextScene.focusId);setSelectedId(current=>current&&nextScene.graph.nodes.some(node=>node.id===current)?current:null);
    }catch(reason){
      const message=reason instanceof Error?reason.message:String(reason);setError(message);setStale(Boolean(sceneRef.current));
    }finally{setLoading(false)}
  },[embedded]);
  useEffect(()=>{void load()},[load]);useEffect(()=>{document.title='NEXO Atlas · Neural V4'},[]);useEffect(()=>{persistThemeMode(themeMode)},[themeMode]);
  const focusNode=useMemo(()=>scene?.graph.nodes.find(node=>node.id===focusId)||null,[focusId,scene]);const semanticLevel=focusId===ATLAS_V3_PRESENTATION_ROOT?0:Math.min(3,(focusNode?semanticDepthForNode(focusNode):1)+1);
  const contextGraph=useMemo(()=>scene?graphForContext(scene,primaryDomain,overlays):null,[overlays,primaryDomain,scene]);
  const layerGraph=useMemo(()=>{if(!contextGraph)return null;const visible=buildSemanticVisibility(contextGraph,{focusId,selectedId:selectedId||'',level:semanticLevel,budget:compact?18:focusId===ATLAS_V3_PRESENTATION_ROOT?20:36});const nodes=contextGraph.nodes.filter(node=>visible.has(node.id));const ids=new Set(nodes.map(node=>node.id));const edges=contextGraph.edges.filter(edge=>ids.has(edge.source)&&ids.has(edge.target));return{...contextGraph,nodes,edges,visualTotal:nodes.length}},[compact,contextGraph,focusId,selectedId,semanticLevel]);
  useEffect(()=>{if(layerGraph&&!layerGraph.nodes.some(node=>node.id===focusId)){setFocusId(ATLAS_V3_PRESENTATION_ROOT);setFocusHistory([])}},[focusId,layerGraph]);
  useEffect(()=>{if(typeof window!=='undefined')writeAtlasSession(window.sessionStorage,{domain:primaryDomain,focusId,selectedId:selectedId||'',overlays,level:semanticLevel})},[focusId,overlays,primaryDomain,selectedId,semanticLevel]);
  const canonicalIds=useMemo(()=>scene?.canonicalIds||new Set<string>(),[scene]);const selectedNode=useMemo(()=>scene?.graph.nodes.find(node=>node.id===selectedId)||null,[scene,selectedId]);
  const searchResults=useMemo(()=>{if(!scene||!query.trim())return[];const q=query.trim().toLocaleLowerCase('pt-BR');return scene.graph.nodes.filter(node=>canonicalIds.has(node.id)&&`${node.id} ${node.label||''} ${node.type||''} ${node.domain||''}`.toLocaleLowerCase('pt-BR').includes(q)).slice(0,8)},[canonicalIds,query,scene]);
  const toggleOverlay=useCallback((overlay:Overlay)=>setOverlays(current=>current.includes(overlay)?current.filter(item=>item!==overlay):[...current,overlay]),[]);
  const focusEntity=useCallback((id:string)=>{if(!scene||!canonicalIds.has(id))return;const node=scene.graph.nodes.find(candidate=>candidate.id===id);if(!node)return;const overlay=overlayForNode(node);if(overlay)setOverlays(current=>current.includes(overlay)?current:[...current,overlay]);setPrimaryDomain(current=>primaryDomainForNode(node,current));setFocusHistory(history=>focusId===id?history:[...history,focusId].slice(-12));setFocusId(id);setSelectedId(id);setInspectorOpen(true);setSearchOpen(false);setQuery('')},[canonicalIds,focusId,scene]);
  const openNode=useCallback((node:AtlasNode)=>{if(onOpenEntity&&!node.presentationOnly)onOpenEntity(node);const overlay=overlayForNode(node);if(overlay)setOverlays(current=>current.includes(overlay)?current:[...current,overlay]);setPrimaryDomain(current=>primaryDomainForNode(node,current));setFocusHistory(history=>focusId===node.id?history:[...history,focusId].slice(-12));setFocusId(node.id);setSelectedId(node.id);setInspectorOpen(compact)},[compact,focusId,onOpenEntity]);
  const selectNode=useCallback((node:AtlasNode)=>{setSelectedId(node.id);setInspectorOpen(true)},[]);
  const goHome=useCallback(()=>{setPrimaryDomain('NEXO');setFocusId(ATLAS_V3_PRESENTATION_ROOT);setFocusHistory([]);setSelectedId(null);setInspectorOpen(false)},[]);
  const resetView=useCallback(()=>{goHome();window.dispatchEvent(new Event('atlas:reset-view'))},[goHome]);
  const fitSelection=useCallback(()=>window.dispatchEvent(new Event('atlas:fit-selection')),[]);
  const goBack=useCallback(()=>{window.dispatchEvent(new Event('atlas:camera-back'));if(!focusHistory.length){setFocusId(ATLAS_V3_PRESENTATION_ROOT);setSelectedId(null);return}const previous=focusHistory[focusHistory.length-1];setFocusHistory(history=>history.slice(0,-1));setFocusId(previous);setSelectedId(previous===ATLAS_V3_PRESENTATION_ROOT?null:previous);setInspectorOpen(false)},[focusHistory]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;const editing=target?.tagName==='INPUT'||target?.tagName==='TEXTAREA'||target?.isContentEditable;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setSearchOpen(true);return}if(editing)return;if(event.key==='Home'){event.preventDefault();resetView();return}if(event.key.toLowerCase()==='f'){event.preventDefault();fitSelection();return}if(event.key.toLowerCase()==='l'){event.preventDefault();toggleOverlay('LEARNING');return}if(event.key==='Escape'){if(inspectorOpen){setInspectorOpen(false);return}if(searchOpen){setSearchOpen(false);setQuery('');return}if(focusId!==ATLAS_V3_PRESENTATION_ROOT)goBack()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[fitSelection,focusId,goBack,inspectorOpen,resetView,searchOpen,toggleOverlay]);
  const counts=snapshot?.universe?.counts||{};const statusText=stale?'STALE · última projeção válida preservada':error?'projeção indisponível':loading?'carregando projeção':`${snapshot?.manifest.completeness||'SNAPSHOT'} · ${snapshot?.manifest.freshness||'SNAPSHOT'}`;const liveState=loading?'SYNCING':stale?'STALE':error?'ATTENTION':'LIVE';const focusLabel=focusId===ATLAS_V3_PRESENTATION_ROOT?'NEXO':displayLabel(focusNode);const diffTotal=syncDiff?(syncDiff.added.length+syncDiff.updated.length+syncDiff.removed.length):0;
  return <main className={`atlas-v3-shell${embedded?' atlas-v3-shell--embedded spatial-knowledge-page':''}`} data-theme={resolvedTheme} data-theme-mode={themeMode} data-presentation="canvas" data-reduced-motion={reducedMotion?'true':'false'} aria-busy={loading}>
    <section className="cinematic-stage" data-testid="atlas-v3-stage" data-graph-language="neural" aria-label="Mapa neural em canvas 2.5D do NEXO" style={{touchAction:'none'}}>{layerGraph&&<AtlasCanvas graph={layerGraph} focusId={focusId} selectedId={selectedId} onSelect={selectNode} onOpen={openNode} reducedMotion={reducedMotion} compact={compact} loading={loading} theme={resolvedTheme} presentationMode="canvas"/>}{loading&&!layerGraph&&<div className="projection-state loading-state" role="status"><span className="loader-orbit"/><b>Materializando universo</b><small>TOWER_V06 → Projection V3 → Spatial Canvas</small></div>}{error&&!scene&&<div className="projection-state error-state" role="alert"><b>Projeção indisponível</b><p>O Atlas não inventará um estado substituto.</p><small>{error}</small><button type="button" onClick={()=>void load()}>Tentar novamente</button></div>}{stale&&scene&&<div className="projection-state stale-state" role="status"><b>STALE</b><small>Falha na atualização. Mantendo o último snapshot válido.</small><button type="button" onClick={()=>void load()}>Tentar novamente</button></div>}{!loading&&!error&&layerGraph&&layerGraph.nodes.length<=1&&<div className="projection-state empty-state"><b>Nenhuma entidade encontrada</b><small>Este contexto não possui entidades publicadas neste snapshot.</small></div>}{snapshot&&primaryDomain==='HEALTH'&&!loading&&<HealthLayerPanel snapshot={snapshot}/>}</section>
    <header className="top-hud glass-panel"><div className="brand-block"><span className="brand-orbit" aria-hidden="true">◎</span><div><strong>NEXO Atlas</strong><small>NEURAL V4 · SPATIAL CANVAS</small></div></div><div className="atlas-breadcrumb" aria-label="Localização espacial"><span>NEXO</span><b>›</b><span>{DOMAIN_LABELS[primaryDomain]}</span>{focusLabel!=='NEXO'&&<><b>›</b><strong>{focusLabel}</strong></>}</div><div className="neural-state" aria-live="polite"><i className={liveState==='ATTENTION'||liveState==='STALE'?'attention':''}/><span><b>{liveState}</b><small>{overlays.length?`${overlays.length} overlay${overlays.length===1?'':'s'} ativo${overlays.length===1?'':'s'}`:'Estrutura factual'}</small></span></div><div className="theme-switch" role="group" aria-label="Tema do Atlas"><button type="button" className={themeMode==='system'?'active':''} aria-pressed={themeMode==='system'} aria-label="Usar tema do sistema" title="Automático" onClick={()=>setThemeMode('system')}>◐</button><button type="button" className={themeMode==='light'?'active':''} aria-pressed={themeMode==='light'} aria-label="Usar tema claro" title="Claro" onClick={()=>setThemeMode('light')}>☼</button><button type="button" className={themeMode==='dark'?'active':''} aria-pressed={themeMode==='dark'} aria-label="Usar tema escuro" title="Escuro" onClick={()=>setThemeMode('dark')}>☾</button></div><div className="tower-status"><i/><span><b>TOWER_V06</b><small>{statusText}</small></span></div></header>
    <div className="scene-caption" aria-live="polite"><span>{primaryDomain}</span><b>{focusLabel}</b><small>{layerGraph?.nodes.length??0} visíveis · {counts.nodes??0} publicados · LOD {semanticLevel} · fingerprint {short(snapshot?.manifest.fingerprint||'—',20)}</small></div>
    <nav className="neural-layer-bar atlas-domain-bar glass-panel" role="toolbar" aria-label="Domínios principais">{PRIMARY_DOMAINS.map((item:string)=><button key={item} type="button" className={`layer-button layer-button--${item.toLowerCase()} ${primaryDomain===item?'active':''}`} aria-pressed={primaryDomain===item} onClick={()=>{setPrimaryDomain(item as PrimaryDomain);setFocusId(ATLAS_V3_PRESENTATION_ROOT);setSelectedId(null)}}><i aria-hidden="true"/><span>{DOMAIN_LABELS[item as PrimaryDomain]}</span></button>)}</nav>
    <div className="atlas-overlay-menu glass-panel" role="group" aria-label="Overlays contextuais">{OVERLAYS.map((item:string)=><button key={item} type="button" className={`layer-button overlay-button overlay-button--${item.toLowerCase()} ${overlays.includes(item as Overlay)?'active':''}`} aria-pressed={overlays.includes(item as Overlay)} onClick={()=>toggleOverlay(item as Overlay)}><i aria-hidden="true"/><span>{OVERLAY_LABELS[item as Overlay]}</span></button>)}</div>
    <div className="control-dock glass-panel" aria-label="Navegação do grafo"><button className="icon-button" type="button" onClick={goBack} disabled={!focusHistory.length&&focusId===ATLAS_V3_PRESENTATION_ROOT} aria-label="Voltar">←</button><button className="icon-button home-button" type="button" onClick={goHome} aria-label="Voltar ao NEXO">◎</button><button className="icon-button" data-testid="atlas-reset-view" type="button" onClick={resetView} aria-label="Reset view" title="Reset view">⌂</button><button className="icon-button" type="button" onClick={fitSelection} aria-label="Enquadrar seleção" title="Enquadrar seleção (F)">F</button><button className="icon-button search-trigger" type="button" onClick={()=>setSearchOpen(value=>!value)} aria-expanded={searchOpen} aria-controls="atlas-v3-search-panel" aria-label="Buscar entidade">⌕</button><button className="icon-button" type="button" onClick={()=>setInspectorOpen(value=>!value)} aria-expanded={inspectorOpen} aria-controls="atlas-v3-inspector" aria-label="Abrir inspector">◫</button></div>
    {diffTotal>0&&<div className="sync-diff-chip glass-panel" role="status"><b>SYNC COMPLETE</b><span>+{syncDiff?.added.length||0} · ~{syncDiff?.updated.length||0} · −{syncDiff?.removed.length||0}</span></div>}
    {searchOpen&&<section id="atlas-v3-search-panel" className="search-panel glass-panel is-open" aria-label="Busca no Atlas"><label htmlFor="atlas-v3-search">Buscar campanha, claim, teste ou work</label><div className="search-row"><span>⌕</span><input id="atlas-v3-search" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar na projeção…" autoComplete="off"/><kbd>Esc</kbd></div>{query&&<div className="search-results">{searchResults.length?searchResults.map(node=><button className="search-result" type="button" key={node.id} onClick={()=>focusEntity(node.id)}><b>{displayLabel(node)}</b><small>{String(node.type||'—')} · {String(node.status||'—')}</small></button>):<p>Nenhuma entidade encontrada.</p>}</div>}</section>}
    {snapshot&&inspectorOpen&&<Inspector node={selectedNode} snapshot={snapshot} compact={compact} onClose={()=>setInspectorOpen(false)}/>} 
    <footer className="runtime-strip"><span>NAVEGAR: arrastar · ZOOM: roda/pinça · F: enquadrar · L: learning · HOME: universo</span><span>{snapshot?.manifest.sourceVersion||'aguardando Tower'}</span></footer>
  </main>;
}
