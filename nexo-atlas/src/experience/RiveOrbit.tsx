import {useEffect,useRef} from 'react';
import type {Rive} from '@rive-app/canvas';
import wasmUrl from '@rive-app/canvas/rive.wasm?url';
import src from './assets/nexo-orbit.riv?url&no-inline';

/** Local WASM and authored artwork. The machine follows the user's motion control. */
export default function RiveOrbit({active}:{active:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),runtime=useRef<Rive|null>(null),current=useRef(active);current.current=active;
  useEffect(()=>{
    let disposed=false;
    void import('@rive-app/canvas').then(({Rive,RuntimeLoader,Layout,Fit,Alignment})=>{
      if(disposed||!canvas.current)return;RuntimeLoader.setWasmUrl(wasmUrl);RuntimeLoader.setWasmFallbackUrl(null);
      const rive=new Rive({canvas:canvas.current,src,stateMachine:'OrbitState',autoBind:true,autoplay:true,enableRiveAssetCDN:false,useOffscreenRenderer:false,layout:new Layout({fit:Fit.Contain,alignment:Alignment.Center}),onLoad:()=>{if(disposed)return;rive.resizeDrawingSurfaceToCanvas(1.5);const prop=rive.viewModelInstance?.boolean('isActive');if(prop)prop.value=current.current;if(!current.current)rive.pause();},onLoadError:()=>{canvas.current?.setAttribute('hidden','');}});runtime.current=rive;
    }).catch(()=>canvas.current?.setAttribute('hidden',''));
    return()=>{disposed=true;runtime.current?.cleanup();runtime.current=null;};
  },[]);
  useEffect(()=>{const r=runtime.current;if(!r)return;const prop=r.viewModelInstance?.boolean('isActive');if(prop)prop.value=active;if(active)r.play();else r.pause();},[active]);
  return <canvas ref={canvas} className="nx-rive-orbit" width="60" height="60" aria-hidden="true"/>;
}
