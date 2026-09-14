import {Component,Suspense,lazy,useEffect,useState,type ReactNode} from 'react';
import {Canvas25DGraph} from './Canvas25DGraph';
import type {GraphSurfaceProps} from './GraphScene3D';

const GraphScene3D=lazy(()=>import('./GraphScene3D').then(module=>({default:module.GraphScene3D})));

type RendererMode='canvas'|'webgl';
const RENDERER_STORAGE_KEY='atlas-renderer-mode';

function readRendererMode():RendererMode{
  if(typeof window==='undefined')return'canvas';
  const requested=new URLSearchParams(window.location.search).get('renderer');
  if(requested==='webgl')return'webgl';
  try{return window.localStorage.getItem(RENDERER_STORAGE_KEY)==='webgl'?'webgl':'canvas';}catch{return'canvas';}
}

function replaceRendererMode(mode:RendererMode){
  if(typeof window==='undefined')return;
  const params=new URLSearchParams(window.location.search);
  if(mode==='webgl')params.set('renderer','webgl');else params.delete('renderer');
  const search=params.toString();
  const next=`${window.location.pathname}${search?`?${search}`:''}${window.location.hash}`;
  window.history.replaceState(window.history.state,'',next);
}

class RendererBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:unknown){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas:graph-metrics',{detail:{engine:'r3f-webgl',phase:'error',message:error instanceof Error?error.message:'renderer-failed'}}))}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}

export function GraphRenderer(props:GraphSurfaceProps&{zoom?:number;onZoomChange?:(zoom:number)=>void}){
  const [mode,setMode]=useState<RendererMode>(()=>readRendererMode());
  useEffect(()=>{
    const sync=()=>setMode(readRendererMode());
    window.addEventListener('popstate',sync);
    return()=>window.removeEventListener('popstate',sync);
  },[]);
  const switchRenderer=(next:RendererMode)=>{
    replaceRendererMode(next);
    try{window.localStorage.setItem(RENDERER_STORAGE_KEY,next)}catch{/* storage may be unavailable in privacy mode */}
    setMode(next);
  };
  useEffect(()=>{
    // Keep the chosen spatial mode while the user drills across graph routes.
    // The URL remains an explicit share/deep-link override; storage is only the
    // continuity layer for normal in-app navigation.
    try{window.localStorage.setItem(RENDERER_STORAGE_KEY,mode)}catch{/* best effort */}
  },[mode]);
  const webgl=mode==='webgl';
  const canvas25d=<Canvas25DGraph projection={props.projection} selectedId={props.selectedId??null} onSelect={props.onSelect} onOpenNode={id=>props.onOpenNode?.(id)} zoom={props.zoom} onZoomChange={props.onZoomChange}/>;
  if(!webgl)return <div className="graph-renderer-canvas"><button className="graph-renderer-switch" onClick={()=>switchRenderer('webgl')} title="Renderer experimental">WebGL</button>{canvas25d}</div>;
  const fallback=<div className="graph-renderer-rollback"><div className="graph-renderer-error">WebGL indisponível. A cena foi preservada no Canvas 2.5D.</div><button className="graph-renderer-switch" onClick={()=>switchRenderer('canvas')}>Canvas</button>{canvas25d}</div>;
  const loading=<div className="graph-renderer-canvas">{canvas25d}</div>;
  return <RendererBoundary key={props.projection.id} fallback={fallback}><Suspense fallback={loading}><GraphScene3D {...props} onRollback={()=>switchRenderer('canvas')}/></Suspense></RendererBoundary>;
}
