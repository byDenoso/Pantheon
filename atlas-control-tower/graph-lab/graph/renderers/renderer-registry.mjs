const entry=spec=>Object.freeze(spec);

export const RENDERERS=Object.freeze({
 'canvas-2d':entry({id:'canvas-2d',label:'Canvas 2D',engine:'canvas',dimension:'2D',role:'graph',availability:'ready',implementation:'native',mobileSafe:true,baseRenderer:'legacy-canvas',target:'canvas'}),
 'canvas-25d':entry({id:'canvas-25d',label:'Canvas 2.5D',engine:'canvas',dimension:'2.5D',role:'graph',availability:'ready',implementation:'native',mobileSafe:true,baseRenderer:'legacy-canvas',target:'canvas'}),
 'pixi-2d':entry({id:'pixi-2d',label:'PixiJS 2D',engine:'pixi',dimension:'2D',role:'graph',availability:'ready',implementation:'native',mobileSafe:true,baseRenderer:'legacy-canvas',target:'container'}),
 'three-25d':entry({id:'three-25d',label:'Three.js 2.5D',engine:'three',dimension:'2.5D',role:'graph',availability:'ready',implementation:'native',mobileSafe:false,baseRenderer:'three-canvas',target:'container'}),
 'three-3d':entry({id:'three-3d',label:'Three.js 3D',engine:'three',dimension:'3D',role:'graph',availability:'ready',implementation:'native',mobileSafe:false,baseRenderer:'three-canvas',target:'container'}),
 'babylon-25d':entry({id:'babylon-25d',label:'Babylon.js 2.5D',engine:'babylon',dimension:'2.5D',role:'graph',availability:'ready',implementation:'native',mobileSafe:false,baseRenderer:'three-canvas',target:'container'}),
 'babylon-3d':entry({id:'babylon-3d',label:'Babylon.js 3D',engine:'babylon',dimension:'3D',role:'graph',availability:'ready',implementation:'native',mobileSafe:false,baseRenderer:'three-canvas',target:'container'})
});

export const GRAPH_RENDERER_IDS=Object.freeze(Object.keys(RENDERERS));
export const ENVIRONMENT_RENDERER_IDS=Object.freeze([]);

export function rendererById(id='canvas-2d'){return RENDERERS[id]||RENDERERS['canvas-2d']}
export function isRendererId(id){return Object.hasOwn(RENDERERS,id)}
export function resolveRenderer(id,{mobile=false}={}){const requested=rendererById(id);return mobile&&!requested.mobileSafe?RENDERERS['canvas-2d']:requested}
export function rendererCapabilities(id){const renderer=rendererById(id);return Object.freeze({engine:renderer.engine,dimension:renderer.dimension,role:renderer.role,mobileSafe:renderer.mobileSafe,availability:renderer.availability,implementation:renderer.implementation,supportsDepth:renderer.dimension!=='2D',supportsPresentation:['three-25d','three-3d','babylon-25d','babylon-3d'].includes(renderer.id)})}
