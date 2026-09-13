import {Component,useEffect,useState,type ReactNode} from 'react';
import {GraphExplorer} from './GraphExplorer';
import {GraphScene3D,type GraphSurfaceProps} from './GraphScene3D';

type RendererMode='canvas'|'webgl';

function readRendererMode():RendererMode{
  if(typeof window==='undefined')return'canvas';
  return new URLSearchParams(window.location.search).get('renderer')==='webgl'?'webgl':'canvas';
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

export function GraphRenderer(props:GraphSurfaceProps){
  const [mode,setMode]=useState<RendererMode>(()=>readRendererMode());
  useEffect(()=>{
    const sync=()=>setMode(readRendererMode());
    window.addEventListener('popstate',sync);
    return()=>window.removeEventListener('popstate',sync);
  },[]);
  const switchRenderer=(next:RendererMode)=>{replaceRendererMode(next);setMode(next)};
  const webgl=mode==='webgl';
  if(!webgl)return <div className="graph-renderer-canvas"><button className="graph-renderer-switch" onClick={()=>switchRenderer('webgl')} title="Renderer experimental">WebGL</button><GraphExplorer {...props}/></div>;
  const fallback=<div className="graph-renderer-rollback"><div className="graph-renderer-error">WebGL indisponível. A cena foi preservada no Canvas.</div><button className="graph-renderer-switch" onClick={()=>switchRenderer('canvas')}>Canvas</button><GraphExplorer {...props}/></div>;
  return <RendererBoundary key={props.projection.id} fallback={fallback}><GraphScene3D {...props} onRollback={()=>switchRenderer('canvas')}/></RendererBoundary>;
}
