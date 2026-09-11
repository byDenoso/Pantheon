import {Component,type ReactNode} from 'react';
import {useSearchParams} from 'react-router-dom';
import {GraphExplorer} from './GraphExplorer';
import {GraphScene3D,type GraphSurfaceProps} from './GraphScene3D';

class RendererBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:unknown){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas:graph-metrics',{detail:{engine:'r3f-3d',phase:'error',message:error instanceof Error?error.message:'renderer-failed'}}))}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}

export function GraphRenderer(props:GraphSurfaceProps){
  const [params,setParams]=useSearchParams();const rollback=params.get('renderer')==='2d';
  const switchRenderer=(mode:'3d'|'2d')=>{const next=new URLSearchParams(params);if(mode==='2d')next.set('renderer','2d');else next.delete('renderer');setParams(next,{replace:true})};
  if(rollback)return <div className="graph-renderer-rollback"><button className="graph-renderer-switch" onClick={()=>switchRenderer('3d')}>Ativar 3D</button><GraphExplorer {...props}/></div>;
  const fallback=<div className="graph-renderer-rollback"><div className="graph-renderer-error">Renderer 3D indisponível. Fallback Pixi preservado.</div><GraphExplorer {...props}/></div>;
  return <RendererBoundary key={props.projection.id} fallback={fallback}><GraphScene3D {...props} onRollback={()=>switchRenderer('2d')}/></RendererBoundary>;
}
