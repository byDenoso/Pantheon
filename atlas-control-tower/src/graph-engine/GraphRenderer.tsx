import {Component,type ReactNode} from 'react';
import {useSearchParams} from 'react-router-dom';
import {GraphExplorer} from './GraphExplorer';
import {GraphScene3D,type GraphSurfaceProps} from './GraphScene3D';

class RendererBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:unknown){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas:graph-metrics',{detail:{engine:'r3f-webgl',phase:'error',message:error instanceof Error?error.message:'renderer-failed'}}))}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}

export function GraphRenderer(props:GraphSurfaceProps){
  const [params,setParams]=useSearchParams();
  const webgl=params.get('renderer')==='webgl';
  const switchRenderer=(mode:'canvas'|'webgl')=>{const next=new URLSearchParams(params);if(mode==='webgl')next.set('renderer','webgl');else next.delete('renderer');setParams(next,{replace:true})};
  if(!webgl)return <div className="graph-renderer-canvas"><button className="graph-renderer-switch" onClick={()=>switchRenderer('webgl')} title="Renderer experimental">WebGL</button><GraphExplorer {...props}/></div>;
  const fallback=<div className="graph-renderer-rollback"><div className="graph-renderer-error">WebGL indisponível. A cena foi preservada no Canvas.</div><button className="graph-renderer-switch" onClick={()=>switchRenderer('canvas')}>Canvas</button><GraphExplorer {...props}/></div>;
  return <RendererBoundary key={props.projection.id} fallback={fallback}><GraphScene3D {...props} onRollback={()=>switchRenderer('canvas')}/></RendererBoundary>;
}
