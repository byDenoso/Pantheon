const entry=spec=>Object.freeze(spec);

export const RENDERERS=Object.freeze({
 'canvas-2d':entry({id:'canvas-2d',label:'Canvas 2D',engine:'canvas',dimension:'2D',role:'graph',availability:'ready',implementation:'native',mobileSafe:true,baseRenderer:'legacy-canvas'}),
 'canvas-25d':entry({id:'canvas-25d',label:'Canvas 2.5D',engine:'canvas',dimension:'2.5D',role:'graph',availability:'ready',implementation:'native',mobileSafe:true,baseRenderer:'legacy-canvas'}),
 'pixi-2d':entry({id:'pixi-2d',label:'PixiJS 2D · GPU environment',engine:'pixi',dimension:'2D',role:'environment',availability:'ready',implementation:'hybrid',mobileSafe:true,baseRenderer:'legacy-canvas'}),
 'three-25d':entry({id:'three-25d',label:'Three.js 2.5D',engine:'three',dimension:'2.5D',role:'graph',availability:'ready',implementation:'native',mobileSafe:false,baseRenderer:'three-canvas'}),
 'three-3d':entry({id:'three-3d',label:'Three.js 3D',engine:'three',dimension:'3D',role:'graph',availability:'ready',implementation:'native',mobileSafe:false,baseRenderer:'three-canvas'}),
 'babylon-25d':entry({id:'babylon-25d',label:'Babylon.js 2.5D · environment',engine:'babylon',dimension:'2.5D',role:'environment',availability:'ready',implementation:'hybrid',mobileSafe:false,baseRenderer:'three-canvas'}),
 'babylon-3d':entry({id:'babylon-3d',label:'Babylon.js 3D · environment',engine:'babylon',dimension:'3D',role:'environment',availability:'ready',implementation:'hybrid',mobileSafe:false,baseRenderer:'three-canvas'})
});

export const GRAPH_RENDERER_IDS=Object.freeze(Object.values(RENDERERS).filter(item=>item.role==='graph').map(item=>item.id));
export const ENVIRONMENT_RENDERER_IDS=Object.freeze(Object.values(RENDERERS).filter(item=>item.role==='environment').map(item=>item.id));

export function rendererById(id='canvas-2d'){
 return RENDERERS[id]||RENDERERS['canvas-2d'];
}

export function resolveRenderer(id,{mobile=false}={}){
 const requested=rendererById(id);
 if(mobile&&!requested.mobileSafe)return RENDERERS['canvas-2d'];
 return requested;
}

export function rendererCapabilities(id){
 const renderer=rendererById(id);
 return Object.freeze({
  engine:renderer.engine,
  dimension:renderer.dimension,
  role:renderer.role,
  mobileSafe:renderer.mobileSafe,
  availability:renderer.availability,
  implementation:renderer.implementation,
  supportsDepth:renderer.dimension!=='2D',
  supportsPresentation:['three-25d','three-3d','babylon-25d','babylon-3d'].includes(renderer.id)
 });
}
