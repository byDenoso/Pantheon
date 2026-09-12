import {Component,type ReactNode} from 'react';
import {useSearchParams} from 'react-router-dom';
import {GraphExplorer} from './GraphExplorer';
import {GraphScene25D} from './GraphScene25D';
import {GraphScene3D,type GraphSurfaceProps} from './GraphScene3D';

type RendererMode='25d'|'3d'|'2d';

class RendererBoundary extends Component<{fallback:ReactNode;children:ReactNode;engine:string},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:unknown){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas:graph-metrics',{detail:{engine:this.props.engine,phase:'error',message:error instanceof Error?error.message:'renderer-failed'}}))}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}

export function GraphRenderer(props:GraphSurfaceProps){
  const [params,setParams]=useSearchParams();
  const requested=params.get('renderer');
  const mode:RendererMode=requested==='3d'||requested==='2d'||requested==='25d'?requested:'25d';
  const switchRenderer=(nextMode:RendererMode)=>{
    const next=new URLSearchParams(params);
    if(nextMode==='25d')next.delete('renderer');else next.set('renderer',nextMode);
    setParams(next,{replace:true});
  };
  if(mode==='2d')return <div className="graph-renderer-rollback"><button className="graph-renderer-switch" onClick={()=>switchRenderer('25d')}>Ativar 2.5D</button><GraphExplorer {...props}/></div>;
  const fallback=<div className="graph-renderer-rollback"><div className="graph-renderer-error">Renderer visual indisponível. Fallback Pixi preservado.</div><GraphExplorer {...props}/></div>;
  if(mode==='3d')return <RendererBoundary key={`3d:${props.projection.id}`} engine="r3f-3d" fallback={fallback}><GraphScene3D {...props} onRollback={()=>switchRenderer('2d')}/></RendererBoundary>;
  return <RendererBoundary key={`25d:${props.projection.id}`} engine="css-25d" fallback={fallback}><GraphScene25D {...props} onUse3D={()=>switchRenderer('3d')} onRollback={()=>switchRenderer('2d')}/></RendererBoundary>;
}
