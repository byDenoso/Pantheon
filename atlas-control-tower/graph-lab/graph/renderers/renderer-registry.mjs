const entry=(spec)=>Object.freeze(spec);

export const RENDERERS=Object.freeze({
 'canvas-2d':entry({id:'canvas-2d',label:'Canvas 2D',engine:'canvas',dimension:'2D',availability:'ready',mobileSafe:true,baseRenderer:'legacy-canvas'}),
 'pixi-2d':entry({id:'pixi-2d',label:'PixiJS 2D',engine:'pixi',dimension:'2D',availability:'scaffold',mobileSafe:true,baseRenderer:'legacy-canvas'}),
 'three-25d':entry({id:'three-25d',label:'Three.js 2.5D',engine:'three',dimension:'2.5D',availability:'ready',mobileSafe:false,baseRenderer:'three-canvas'}),
 'three-3d':entry({id:'three-3d',label:'Three.js 3D',engine:'three',dimension:'3D',availability:'ready',mobileSafe:false,baseRenderer:'three-canvas'}),
 'babylon-25d':entry({id:'babylon-25d',label:'Babylon.js 2.5D',engine:'babylon',dimension:'2.5D',availability:'scaffold',mobileSafe:false,baseRenderer:'three-canvas'}),
 'babylon-3d':entry({id:'babylon-3d',label:'Babylon.js 3D',engine:'babylon',dimension:'3D',availability:'scaffold',mobileSafe:false,baseRenderer:'three-canvas'})
});

export function rendererById(id='canvas-2d'){
 return RENDERERS[id]||RENDERERS['canvas-2d'];
}

export function resolveRenderer(id,{mobile=false}={}){
 const requested=rendererById(id);
 if(mobile&&!requested.mobileSafe)return RENDERERS['canvas-2d'];
 if(requested.availability==='ready')return requested;
 return Object.freeze({...requested,fallback:requested.baseRenderer==='three-canvas'?'three-25d':'canvas-2d'});
}

export function rendererCapabilities(id){
 const renderer=rendererById(id);
 return Object.freeze({
  engine:renderer.engine,
  dimension:renderer.dimension,
  mobileSafe:renderer.mobileSafe,
  availability:renderer.availability,
  supportsDepth:renderer.dimension!=='2D',
  supportsPresentation:['three-25d','three-3d','babylon-25d','babylon-3d'].includes(renderer.id)
 });
}
