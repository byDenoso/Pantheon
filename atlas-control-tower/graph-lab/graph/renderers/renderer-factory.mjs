import '../volume-rendering.mjs';
import {GraphLabRenderer as LegacyCanvasRenderer} from '../legacy-renderer.mjs';
import {GraphLabRenderer as ThreeGraphRenderer} from '../renderer.mjs';
import {PixiGraphRenderer} from './pixi-graph-renderer.mjs';
import {BabylonGraphRenderer} from './babylon-graph-renderer.mjs';
import {assertGraphRenderer} from './renderer-contract.mjs';
import {rendererById,resolveRenderer} from './renderer-registry.mjs';
import './visual-presets.mjs';

export function rendererClassFor(id){
 const info=rendererById(id);
 if(info.engine==='pixi')return PixiGraphRenderer;
 if(info.engine==='babylon')return BabylonGraphRenderer;
 if(info.engine==='three')return ThreeGraphRenderer;
 return LegacyCanvasRenderer;
}

export function createGraphRenderer({id='canvas-2d',canvas,container,callbacks={},mobile=false}={}){
 const info=resolveRenderer(id,{mobile});const Renderer=rendererClassFor(info.id);const target=info.target==='canvas'?canvas:container;
 if(!target)throw new Error(`Atlas renderer target missing for ${info.id}`);
 const instance=info.engine==='babylon'?new Renderer(target,callbacks,{dimension:info.dimension}):new Renderer(target,callbacks);
 instance.rendererId=info.id;instance.rendererInfo=info;
 if(info.id==='canvas-2d')instance.camera.flat=true;
 if(info.id==='canvas-25d')instance.camera.flat=false;
 if(info.id==='three-3d'&&instance.options)instance.options.autoOrbit=false;
 return assertGraphRenderer(instance,info.id);
}
