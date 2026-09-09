const PIXI_URL='https://esm.sh/pixi.js@8.20.1?bundle';
const BABYLON_URL='https://esm.sh/@babylonjs/core@9.25.0/Legacy/legacy?bundle';
const MOBILE_QUERY='(max-width:760px)';

let active=null;
let switchToken=0;

const stage=()=>document.querySelector('.stage');
const isMobile=()=>typeof matchMedia==='function'&&matchMedia(MOBILE_QUERY).matches;
const requested=()=>document.documentElement.dataset.atlasRenderer||new URLSearchParams(location.search).get('renderer-v4')||'canvas-2d';
const experience=()=>document.documentElement.dataset.atlasExperience||'EXECUTIVE_DEMO';
const domain=()=>document.documentElement.dataset.atlasDomain||'NEXO';
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

function layerHost(kind){
 const root=stage();if(!root)return null;
 let host=root.querySelector('.atlas-engine-layer');
 if(!host){host=document.createElement('div');host.className='atlas-engine-layer';host.setAttribute('aria-hidden','true');root.prepend(host)}
 host.dataset.engine=kind;return host;
}

export function destroyEngine(){
 if(!active)return;
 try{active.destroy?.()}catch(error){console.warn('[Atlas] engine cleanup failed',error)}
 active=null;
 const host=stage()?.querySelector('.atlas-engine-layer');if(host)host.replaceChildren();
 document.documentElement.removeAttribute('data-atlas-engine-active');
}

function domainPalette(){
 return {
  NEXO:{primary:0xffbd59,secondary:0x4bc7ff},
  SCIENCE:{primary:0x46c7ff,secondary:0x2369ff},
  OLYMPUS:{primary:0xb06cff,secondary:0xff5fc8},
  ENGINEERING:{primary:0x42e6c5,secondary:0x2dbb73}
 }[domain()]||{primary:0x46c7ff,secondary:0x7b8cff};
}

async function mountPixi(token){
 const host=layerHost('pixi-2d');if(!host)return;
 const PIXI=await import(PIXI_URL);if(token!==switchToken)return;
 const app=new PIXI.Application();
 await app.init({resizeTo:host,backgroundAlpha:0,antialias:true,preference:'webgpu',powerPreference:'high-performance'});
 if(token!==switchToken){app.destroy(true);return}
 app.canvas.className='atlas-engine-canvas atlas-engine-pixi';host.append(app.canvas);
 const palette=domainPalette();
 const field=new PIXI.Container();app.stage.addChild(field);
 const particles=[];
 for(let i=0;i<120;i++){
  const g=new PIXI.Graphics().circle(0,0,i%19===0?1.8:i%7===0?1.15:.65).fill({color:i%3===0?palette.secondary:0xb9dcff,alpha:i%19===0?.72:.26});
  g.x=(i*83.37%1000)/1000*app.screen.width;g.y=(i*47.13%1000)/1000*app.screen.height;g.alpha=.4+(i%5)*.08;field.addChild(g);particles.push(g);
 }
 const aura=new PIXI.Graphics().circle(0,0,150).fill({color:palette.primary,alpha:.045});aura.x=app.screen.width*.5;aura.y=app.screen.height*.48;field.addChildAt(aura,0);
 const tick=time=>{if(reducedMotion())return;const dt=time.deltaTime||1;for(let i=0;i<particles.length;i++){const p=particles[i];p.x+=((i%5)-2)*.012*dt;p.y+=((i%7)-3)*.006*dt;if(p.x<0)p.x=app.screen.width;if(p.x>app.screen.width)p.x=0;if(p.y<0)p.y=app.screen.height;if(p.y>app.screen.height)p.y=0}aura.scale.set(1+Math.sin(performance.now()*.0006)*.035)};
 app.ticker.add(tick);
 active={id:'pixi-2d',destroy(){app.ticker.remove(tick);app.destroy(true,{children:true})}};
 document.documentElement.dataset.atlasEngineActive='pixi-2d';
}

async function mountBabylon(id,token){
 const host=layerHost(id);if(!host)return;
 const BABYLON=await import(BABYLON_URL);if(token!==switchToken)return;
 const canvas=document.createElement('canvas');canvas.className='atlas-engine-canvas atlas-engine-babylon';host.append(canvas);
 const engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true,powerPreference:'high-performance'});
 const scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(0,0,0,0);
 const is3d=id==='babylon-3d';
 const camera=new BABYLON.ArcRotateCamera('atlas-camera',-Math.PI/2,Math.PI/2.45,is3d?15:18,new BABYLON.Vector3(0,0,0),scene);
 camera.lowerRadiusLimit=8;camera.upperRadiusLimit=28;camera.wheelPrecision=80;camera.panningSensibility=0;
 const light=new BABYLON.HemisphericLight('atlas-light',new BABYLON.Vector3(.2,1,-.2),scene);light.intensity=.55;
 const palette=domainPalette();
 const toColor=n=>BABYLON.Color3.FromHexString('#'+n.toString(16).padStart(6,'0'));
 const center=BABYLON.MeshBuilder.CreateSphere('nexo',{diameter:is3d?.72:.48,segments:16},scene);center.material=new BABYLON.StandardMaterial('nexo-mat',scene);center.material.emissiveColor=toColor(palette.primary);center.material.alpha=.33;
 const colors=[0x46c7ff,0xb06cff,0x42e6c5];
 for(let i=0;i<3;i++){
  const angle=-Math.PI/2+i*Math.PI*2/3;const r=is3d?5.4:6.2;const y=is3d?(i-1)*.8:0;
  const sphere=BABYLON.MeshBuilder.CreateSphere(`macro-${i}`,{diameter:.34,segments:12},scene);sphere.position.set(Math.cos(angle)*r,y,Math.sin(angle)*r*.58);sphere.material=new BABYLON.StandardMaterial(`macro-mat-${i}`,scene);sphere.material.emissiveColor=toColor(colors[i]);sphere.material.alpha=.24;
  const ring=BABYLON.MeshBuilder.CreateTorus(`orbit-${i}`,{diameter:r*2,thickness:.012,tessellation:96},scene);ring.rotation.x=Math.PI/2+(is3d?(i-1)*.08:0);ring.scaling.z=.58;ring.material=new BABYLON.StandardMaterial(`orbit-mat-${i}`,scene);ring.material.emissiveColor=toColor(colors[i]);ring.material.alpha=.07;
 }
 const resize=()=>engine.resize();addEventListener('resize',resize);
 engine.runRenderLoop(()=>{if(!reducedMotion()&&experience().includes('PRESENTATION'))camera.alpha+=.00025;scene.render()});
 active={id,destroy(){removeEventListener('resize',resize);scene.dispose();engine.stopRenderLoop();engine.dispose()}};
 document.documentElement.dataset.atlasEngineActive=id;
}

export async function activateRequestedEngine(){
 const token=++switchToken;destroyEngine();
 let id=requested();
 if(isMobile()&&id.startsWith('babylon'))id='canvas-2d';
 if(id==='pixi-2d')return mountPixi(token);
 if(id==='babylon-25d'||id==='babylon-3d')return mountBabylon(id,token);
 document.documentElement.dataset.atlasEngineActive=id;
}

function install(){
 activateRequestedEngine().catch(error=>console.warn('[Atlas] optional engine bridge unavailable; canonical renderer remains active.',error));
 if(typeof MutationObserver==='function')new MutationObserver(records=>{
  if(records.some(r=>['data-atlas-renderer','data-atlas-domain','data-atlas-experience'].includes(r.attributeName)))activateRequestedEngine().catch(error=>console.warn('[Atlas] engine switch failed',error));
 }).observe(document.documentElement,{attributes:true,attributeFilter:['data-atlas-renderer','data-atlas-domain','data-atlas-experience']});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else queueMicrotask(install);
