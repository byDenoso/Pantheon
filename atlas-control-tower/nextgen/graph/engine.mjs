// NEXO Atlas graph engine — WebGL (Three.js) renderer.
//
// The public surface is unchanged from the canvas-2D engine it replaces:
//   new AtlasEngine(canvas,{onSelect,onOpen,onZoom})
//   .camera.zoom  .setData()  .setSelected()  .focusSelected()
//   .setZoom()  .zoom()  .reset()  .toggleFlat()  .toggleOrbit()
// layoutGraph/labelPolicy are re-exported so existing imports keep working.

import * as THREE from '../vendor/three.module.min.js';
import {layoutGraph,labelPolicy,LINEAGE_BREAKPOINT,depthRank} from './layout.mjs';
import {LabelLayer} from './labels.mjs';

export {layoutGraph,labelPolicy};

export const TYPE_COLOR={SYSTEM:'#8db7ff',DOMAIN:'#66d6ff',PROJECT:'#66d6ff',CAMPAIGN:'#967cff',HYPOTHESIS:'#f17ec2',DECISION_HYPOTHESIS:'#f17ec2',CLAIM:'#e983c2',TEST:'#70e6bd',RESULT:'#ffd06b',DATASET:'#8da4ff',MODEL:'#b895ff',PROBE:'#73cfff',PUBLICATION:'#f4a66e',SOURCE:'#c9d4e8',SOURCE_REF:'#8b98af',OPERATION:'#7fd4ff',RUN:'#9ad0ff',MEMORY:'#b6a4ff',POLICY:'#b6a4ff',STRATEGY:'#c0b0ff',SKILL:'#a8c0ff',LEARNING:'#a8b8ff'};
export const STATUS_DANGER=/blocked|kill|negative|contrad/i;
const EDGE_COLOR={SUPPORTS:'#70e6bd',CONTRADICTS:'#ff6d88',KILLS:'#ff5f7a',TESTS:'#c778ff',PRODUCES:'#ffd06b',PRODUCES_RESULT:'#ffd06b',VALIDATES:'#70e6bd',DERIVED_FROM:'#7da0d6',OBSERVED_BY:'#c7d5ea',LOCATED_AT:'#7b8aa4',CONTAINS:'#4f719d',EXECUTED_AS:'#8fb6e8',PRIMARY_TEST:'#c778ff',ASSOCIATED_WITH:'#7f8fb0'};

// Learning / continuity / science edges carry the strongest pulse, per the
// observatory's reading order: those are the lines that mean "this is alive".
const PULSE_WEIGHT={SUPPORTS:1,CONTRADICTS:1,KILLS:1,TESTS:.95,VALIDATES:.95,PRODUCES_RESULT:.9,PRODUCES:.9,PRIMARY_TEST:.85,ASSOCIATED_WITH:.8,DERIVED_FROM:.6,EXECUTED_AS:.6,OBSERVED_BY:.4,LOCATED_AT:.3,CONTAINS:.25};

// Perspective size constant: aSize * SIZE_SCALE / distance = pixels.
const SIZE_SCALE=1150;
const SHAPE={CIRCLE:0,DIAMOND:1,SQUARE:2};
const EDGE_SEGMENTS=10;
const CHILD_LIMIT=14;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let h=0;for(const ch of String(s))h=(Math.imul(h,31)+ch.charCodeAt(0))|0;return Math.abs(h)};
const colorOf=hex=>new THREE.Color(hex);

function shapeFor(node){
  const t=node.visualType||node.type;
  if(t==='HYPOTHESIS'||t==='CLAIM'||t==='DECISION_HYPOTHESIS')return SHAPE.DIAMOND;
  if(t==='SOURCE'||t==='SOURCE_REF')return SHAPE.SQUARE;
  return SHAPE.CIRCLE;
}

const NODE_VERT=`
attribute vec3 aColor; attribute float aSize; attribute float aShape;
attribute float aActivity; attribute float aState;
uniform float uPixelRatio; uniform float uTime; uniform float uReduced; uniform float uSizeScale;
varying vec3 vColor; varying float vShape; varying float vState; varying float vActivity;
void main(){
  vColor=aColor; vShape=aShape; vState=aState; vActivity=aActivity;
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  float pulse=1.0+sin(uTime*2.6+position.x*0.05+position.y*0.05)*0.05*aActivity*(1.0-uReduced);
  // uSizeScale is tuned so a SYSTEM node reads at roughly the same pixel size as
  // the canvas-2D engine drew it at the default macro framing. The upper clamp
  // stops a close-up from turning one node into a screen-filling sprite.
  float size=aSize*pulse*(uSizeScale/max(1.0,-mv.z));
  gl_PointSize=clamp(size,1.5,96.0)*uPixelRatio;
  gl_Position=projectionMatrix*mv;
}`;

// vState: 0 = normal, 1 = dimmed (out of the focused neighbourhood),
// 2 = selected/hovered ring.
const NODE_FRAG=`
precision mediump float;
varying vec3 vColor; varying float vShape; varying float vState; varying float vActivity;
float shapeMask(vec2 p,float kind){
  if(kind<0.5) return length(p);
  if(kind<1.5) return abs(p.x)+abs(p.y);
  return max(abs(p.x),abs(p.y));
}
void main(){
  vec2 p=gl_PointCoord*2.0-1.0;
  float d=shapeMask(p,vShape);
  float core=1.0-smoothstep(0.34,0.46,d);
  float ring=smoothstep(0.44,0.50,d)*(1.0-smoothstep(0.56,0.64,d));
  float halo=(1.0-smoothstep(0.0,1.0,d))*(0.10+0.24*vActivity);
  float dim=vState>0.5&&vState<1.5?0.16:1.0;
  float boost=vState>1.5?1.0:0.0;
  float a=(core*0.55+ring*0.95+halo)*dim;
  a+=ring*boost*0.6;
  if(a<0.005) discard;
  vec3 col=vColor*(0.75+core*0.5+boost*0.3);
  gl_FragColor=vec4(col,a);
}`;

const EDGE_VERT=`
attribute vec3 aColor; attribute float aT; attribute float aPhase;
attribute float aSpeed; attribute float aWeight; attribute float aState;
varying vec3 vColor; varying float vT; varying float vPhase;
varying float vSpeed; varying float vWeight; varying float vState;
void main(){
  vColor=aColor; vT=aT; vPhase=aPhase; vSpeed=aSpeed; vWeight=aWeight; vState=aState;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

// The travelling band is the pulse. uDetail collapses it to a plain line when
// the camera is far out, which is where the cost would otherwise pile up.
const EDGE_FRAG=`
precision mediump float;
varying vec3 vColor; varying float vT; varying float vPhase;
varying float vSpeed; varying float vWeight; varying float vState;
uniform float uTime; uniform float uDetail; uniform float uIntensity;
void main(){
  // Structural edges (CONTAINS) are the skeleton: they must be readable but must
  // not out-shout the scientific relations layered on top of them.
  float base=vState>0.5?0.04:(0.07+0.26*vWeight);
  float head=fract(uTime*vSpeed+vPhase);
  float d=abs(vT-head);
  d=min(d,1.0-d);
  float band=(1.0-smoothstep(0.0,0.11,d))*vWeight*uDetail*uIntensity;
  float a=base+band*0.85;
  if(vState>0.5) a=min(a,0.10);
  if(a<0.004) discard;
  gl_FragColor=vec4(vColor*(0.85+band*0.9),a);
}`;

export class AtlasEngine{
  constructor(canvas,{onSelect,onOpen,onZoom}={}){
    this.canvas=canvas;
    this.callbacks={onSelect,onOpen,onZoom};
    this.camera={yaw:.34,pitch:-.24,zoom:.72,panX:0,panY:0,flat:false};
    this.graph={nodes:[],edges:[]};
    this.positions=new Map();
    this.points=[];
    this.selected=null;this.hover=null;this.focus='system:NEXO';
    this.layoutKey='';this.frame=0;this.last=0;this.orbit=false;
    this.collapsed=new Set();this.autoCollapsed=false;
    this.drag=null;this.pointers=new Map();
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pulseIntensity=1;this.pulseSpeed=1;
    this.w=canvas.clientWidth||1024;this.h=canvas.clientHeight||720;

    this.initThree();
    this.initLabels();
    this.bind();
    this.resizeObserver=new ResizeObserver(()=>{this.resize();this.reflow();this.kick()});
    this.resizeObserver.observe(canvas);
    this.resize();
    this.kick();
  }

  // ---------- setup ----------
  initThree(){
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x000000,0);
    this.scene=new THREE.Scene();
    this.three=new THREE.PerspectiveCamera(46,1,1,9000);
    this.target=new THREE.Vector3(0,0,0);

    this.nodeGeom=new THREE.BufferGeometry();
    this.nodeMat=new THREE.ShaderMaterial({
      vertexShader:NODE_VERT,fragmentShader:NODE_FRAG,
      uniforms:{uPixelRatio:{value:1},uTime:{value:0},uReduced:{value:this.reduced?1:0},uSizeScale:{value:SIZE_SCALE}},
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
    });
    this.nodeMesh=new THREE.Points(this.nodeGeom,this.nodeMat);
    this.nodeMesh.frustumCulled=false;
    this.scene.add(this.nodeMesh);

    this.edgeGeom=new THREE.BufferGeometry();
    this.edgeMat=new THREE.ShaderMaterial({
      vertexShader:EDGE_VERT,fragmentShader:EDGE_FRAG,
      uniforms:{uTime:{value:0},uDetail:{value:1},uIntensity:{value:1}},
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
    });
    this.edgeMesh=new THREE.LineSegments(this.edgeGeom,this.edgeMat);
    this.edgeMesh.frustumCulled=false;
    this.scene.add(this.edgeMesh);

    this.buildStars();
  }
  buildStars(){
    const count=420,pos=new Float32Array(count*3),size=new Float32Array(count),col=new Float32Array(count*3),extra=new Float32Array(count*3);
    const tint=colorOf('#cde2ff');
    for(let i=0;i<count;i++){
      pos[i*3]=(hash('sx'+i)%20000)/10-1000;
      pos[i*3+1]=(hash('sy'+i)%14000)/10-700;
      pos[i*3+2]=-1400-(hash('sz'+i)%1600);
      size[i]=i%19===0?3.4:1.7;
      col[i*3]=tint.r;col[i*3+1]=tint.g;col[i*3+2]=tint.b;
      extra[i*3]=0;extra[i*3+1]=(hash('sa'+i)%100)/380;extra[i*3+2]=SHAPE.CIRCLE;
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('aSize',new THREE.BufferAttribute(size,1));
    g.setAttribute('aColor',new THREE.BufferAttribute(col,3));
    g.setAttribute('aState',new THREE.BufferAttribute(new Float32Array(count),1));
    g.setAttribute('aActivity',new THREE.BufferAttribute(extra.filter((_,i)=>i%3===1),1));
    g.setAttribute('aShape',new THREE.BufferAttribute(new Float32Array(count),1));
    this.starMesh=new THREE.Points(g,this.nodeMat);
    this.starMesh.frustumCulled=false;
    this.scene.add(this.starMesh);
  }
  initLabels(){
    const host=document.createElement('div');
    host.className='atlas-label-layer';
    host.setAttribute('aria-hidden','false');
    (this.canvas.parentElement||document.body).appendChild(host);
    this.labelHost=host;
    this.labels=new LabelLayer(host);
  }

  // ---------- graph shaping ----------
  childIndex(){
    if(this._childIndex&&this._childKey===this.graph)return this._childIndex;
    const kids=new Map();
    for(const n of this.graph.nodes||[]){
      const p=n.parentId;
      if(!p)continue;
      if(!kids.has(p))kids.set(p,[]);
      kids.get(p).push(n.id);
    }
    this._childIndex=kids;this._childKey=this.graph;
    return kids;
  }
  // Nodes hidden because an ancestor is collapsed.
  hiddenIds(){
    const kids=this.childIndex();
    const hidden=new Set();
    const walk=id=>{for(const child of kids.get(id)||[]){if(hidden.has(child))continue;hidden.add(child);walk(child)}};
    for(const id of this.collapsed)walk(id);
    return hidden;
  }
  visibleGraph(){
    const hidden=this.hiddenIds();
    if(!hidden.size)return this.graph;
    const nodes=(this.graph.nodes||[]).filter(n=>!hidden.has(n.id));
    const ids=new Set(nodes.map(n=>n.id));
    return {...this.graph,nodes,edges:(this.graph.edges||[]).filter(e=>ids.has(e.source)&&ids.has(e.target))};
  }
  autoCollapse(){
    // On first load of a dense graph, fold ranks deeper than a campaign so the
    // opening view is readable; the user expands what they care about.
    const kids=this.childIndex();
    if((this.graph.nodes||[]).length<=CHILD_LIMIT*3)return;
    for(const n of this.graph.nodes||[]){
      const list=kids.get(n.id);
      if(list&&list.length>CHILD_LIMIT&&depthRank(n)>=2)this.collapsed.add(n.id);
    }
  }
  hiddenChildCount(id){
    const kids=this.childIndex();
    let total=0;
    const walk=x=>{for(const c of kids.get(x)||[]){total++;walk(c)}};
    if(this.collapsed.has(id))walk(id);
    return total;
  }
  toggleSubgraph(id){
    if(!id)return false;
    if(this.collapsed.has(id))this.collapsed.delete(id);else this.collapsed.add(id);
    this.reflow(true);this.kick();
    return !this.collapsed.has(id);
  }
  expandAll(){this.collapsed.clear();this.reflow(true);this.kick()}

  // ---------- layout / buffers ----------
  reflow(force=false){
    const width=this.canvas.clientWidth||1024;
    const mode=width<LINEAGE_BREAKPOINT?'mobile':'desktop';
    const key=`${this.graph.semanticView||'macro'}:${mode}:${this.collapsed.size}:${[...this.collapsed].sort().join(',')}`;
    if(!force&&key===this.layoutKey)return false;
    this.layoutKey=key;
    this.view=this.visibleGraph();
    this.positions=new Map(layoutGraph(this.view.nodes,{
      focus:this.focus,semanticView:this.view.semanticView,viewportWidth:width,edges:this.view.edges
    }).map(p=>[p.id,p]));
    this.uploadNodes();
    this.uploadEdges();
    return true;
  }
  uploadNodes(){
    const list=this.view?.nodes||[];
    const n=list.length;
    const pos=new Float32Array(n*3),col=new Float32Array(n*3),size=new Float32Array(n),
          shape=new Float32Array(n),act=new Float32Array(n),state=new Float32Array(n);
    this.index=new Map();
    for(let i=0;i<n;i++){
      const node=list[i];
      const p=this.positions.get(node.id)||{x:0,y:0,z:0};
      pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;
      let hex=TYPE_COLOR[node.visualType||node.type]||'#91a7c6';
      if(STATUS_DANGER.test(String(node.status||node.summary||'')))hex='#ff6d88';
      const c=colorOf(hex);
      col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;
      size[i]=this.nodeSize(node);
      shape[i]=shapeFor(node);
      act[i]=node.temporalWeight??.25;
      state[i]=0;
      this.index.set(node.id,i);
    }
    const g=this.nodeGeom;
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('aColor',new THREE.BufferAttribute(col,3));
    g.setAttribute('aSize',new THREE.BufferAttribute(size,1));
    g.setAttribute('aShape',new THREE.BufferAttribute(shape,1));
    g.setAttribute('aActivity',new THREE.BufferAttribute(act,1));
    g.setAttribute('aState',new THREE.BufferAttribute(state,1));
    g.setDrawRange(0,n);
    this.nodeState=state;
  }
  uploadEdges(){
    const edges=this.view?.edges||[];
    const verts=[],cols=[],ts=[],phases=[],speeds=[],weights=[],states=[];
    for(const e of edges){
      const a=this.positions.get(e.source),b=this.positions.get(e.target);
      if(!a||!b)continue;
      const hex=EDGE_COLOR[e.type]||'#52739e';
      const c=colorOf(hex);
      const w=PULSE_WEIGHT[e.type]??.5;
      const key=e.id||`${e.source}->${e.target}`;
      const phase=(hash(key)%1000)/1000;
      const speed=.10+(hash('s'+key)%40)/400;
      // Arc the edge out of plane so overlapping relations stay separable.
      const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,mz=(a.z+b.z)/2;
      const dx=b.x-a.x,dy=b.y-a.y;
      const len=Math.hypot(dx,dy)||1;
      const bow=Math.min(70,len*.16);
      const cx=mx-dy/len*bow,cy=my+dx/len*bow,cz=mz+bow*.5;
      let px=a.x,py=a.y,pz=a.z;
      for(let s=1;s<=EDGE_SEGMENTS;s++){
        const t=s/EDGE_SEGMENTS,m=1-t;
        const qx=m*m*a.x+2*m*t*cx+t*t*b.x;
        const qy=m*m*a.y+2*m*t*cy+t*t*b.y;
        const qz=m*m*a.z+2*m*t*cz+t*t*b.z;
        verts.push(px,py,pz,qx,qy,qz);
        cols.push(c.r,c.g,c.b,c.r,c.g,c.b);
        ts.push((s-1)/EDGE_SEGMENTS,t);
        phases.push(phase,phase);
        speeds.push(speed,speed);
        weights.push(w,w);
        states.push(0,0);
        px=qx;py=qy;pz=qz;
      }
    }
    const g=this.edgeGeom;
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(verts),3));
    g.setAttribute('aColor',new THREE.BufferAttribute(new Float32Array(cols),3));
    g.setAttribute('aT',new THREE.BufferAttribute(new Float32Array(ts),1));
    g.setAttribute('aPhase',new THREE.BufferAttribute(new Float32Array(phases),1));
    g.setAttribute('aSpeed',new THREE.BufferAttribute(new Float32Array(speeds),1));
    g.setAttribute('aWeight',new THREE.BufferAttribute(new Float32Array(weights),1));
    g.setAttribute('aState',new THREE.BufferAttribute(new Float32Array(states),1));
    this.edgeState=g.getAttribute('aState');
    this.edgeList=edges;
  }
  nodeSize(n){
    if(n.id===this.focus)return 52;
    const t=n.visualType||n.type;
    if(t==='SYSTEM')return 46;
    if(t==='DOMAIN'||t==='PROJECT')return 38;
    if(t==='CAMPAIGN')return 30;
    if(t==='SOURCE'||t==='SOURCE_REF')return 22;
    return 19;
  }

  // ---------- focus highlighting ----------
  relatedTo(id){
    const set=new Set();
    if(!id)return set;
    set.add(id);
    for(const e of this.view?.edges||[]){
      if(e.source===id)set.add(e.target);
      else if(e.target===id)set.add(e.source);
    }
    return set;
  }
  applyState(){
    const active=this.selected||this.hover;
    const related=this.relatedTo(active);
    const state=this.nodeState;
    if(state){
      for(const [id,i] of this.index||[]){
        let v=0;
        if(active&&!related.has(id))v=1;
        if(id===this.selected||id===this.hover)v=2;
        state[i]=v;
      }
      this.nodeGeom.getAttribute('aState').needsUpdate=true;
    }
    const es=this.edgeState;
    if(es&&this.edgeList){
      let cursor=0;
      for(const e of this.edgeList){
        if(!this.positions.get(e.source)||!this.positions.get(e.target))continue;
        const dim=active&&!(related.has(e.source)&&related.has(e.target))?1:0;
        for(let s=0;s<EDGE_SEGMENTS*2;s++)es.array[cursor+s]=dim;
        cursor+=EDGE_SEGMENTS*2;
      }
      es.needsUpdate=true;
    }
    this.relatedSet=related;
  }

  // ---------- camera ----------
  resize(){
    const w=this.canvas.clientWidth||1024,h=this.canvas.clientHeight||720;
    this.w=w;this.h=h;
    const dpr=Math.min(devicePixelRatio||1,2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w,h,false);
    this.nodeMat.uniforms.uPixelRatio.value=dpr;
    this.three.aspect=w/h;
    this.three.updateProjectionMatrix();
    if(this.labelHost){this.labelHost.style.width=`${w}px`;this.labelHost.style.height=`${h}px`}
  }
  syncCamera(){
    const c=this.camera;
    const pitch=c.flat?0:c.pitch;
    const yaw=c.flat?0:c.yaw;
    // Zoom maps to dolly distance; the constant keeps the framing equivalent to
    // the previous 2D projection so saved zoom levels still read the same.
    const dist=clamp(1500/Math.max(.05,c.zoom),260,7200);
    const cp=Math.cos(pitch),sp=Math.sin(pitch);
    this.target.set(-c.panX*1.4,c.panY*1.4,0);
    this.three.position.set(
      this.target.x+Math.sin(yaw)*cp*dist,
      this.target.y+sp*dist,
      this.target.z+Math.cos(yaw)*cp*dist
    );
    this.three.up.set(0,1,0);
    this.three.lookAt(this.target);
    this.three.updateMatrixWorld();
  }
  setZoom(value){this.camera.zoom=clamp(value,.48,3.1);this.callbacks.onZoom?.(this.camera.zoom);this.kick()}
  zoom(f){this.setZoom(this.camera.zoom*f)}
  reset(){
    const view=this.graph.semanticView;
    Object.assign(this.camera,{yaw:.34,pitch:-.24,panX:0,panY:0,
      zoom:view==='macro'?.72:view==='provenance'?2.1:1.2});
    this.callbacks.onZoom?.(this.camera.zoom);this.kick();
  }
  toggleFlat(){this.camera.flat=!this.camera.flat;this.kick();return this.camera.flat}
  toggleOrbit(){if(this.reduced)return false;this.orbit=!this.orbit;this.kick();return this.orbit}
  focusSelected(){
    const p=this.positions.get(this.selected);
    if(!p)return;
    this.camera.panX=-p.x/1.4;this.camera.panY=p.y/1.4;
    this.kick();
  }

  // ---------- data ----------
  setData(graph,{focus}={}){
    this.graph=graph||{nodes:[],edges:[]};
    this.focus=focus||graph?.focus||this.focus;
    this._childIndex=null;
    this.collapsed.clear();
    this.autoCollapse();
    this.layoutKey='';
    this.selected=null;this.hover=null;
    this.reflow(true);
    this.applyState();
    this.kick();
  }
  setSelected(id){this.selected=id;this.applyState();this.kick()}

  // ---------- interaction ----------
  project(id){
    const p=this.positions.get(id);
    if(!p)return null;
    const v=new THREE.Vector3(p.x,p.y,p.z).project(this.three);
    if(v.z<-1||v.z>1)return null;
    return {x:(v.x*.5+.5)*this.w,y:(-v.y*.5+.5)*this.h,depth:v.z};
  }
  screenPoints(){
    const out=[];
    const v=new THREE.Vector3();
    for(const node of this.view?.nodes||[]){
      const p=this.positions.get(node.id);
      if(!p)continue;
      v.set(p.x,p.y,p.z).project(this.three);
      if(v.z<-1||v.z>1)continue;
      const x=(v.x*.5+.5)*this.w,y=(-v.y*.5+.5)*this.h;
      if(x<-120||y<-120||x>this.w+120||y>this.h+120)continue;
      const dist=this.three.position.distanceTo(new THREE.Vector3(p.x,p.y,p.z));
      const r=Math.max(3,Math.min(96,this.nodeSize(node)*SIZE_SCALE/Math.max(1,dist))/2);
      let hex=TYPE_COLOR[node.visualType||node.type]||'#91a7c6';
      if(STATUS_DANGER.test(String(node.status||node.summary||'')))hex='#ff6d88';
      out.push({id:node.id,node,x,y,r,depth:v.z,visible:true,color:hex});
    }
    return out;
  }
  hit(x,y){
    let best=null,bestD=Infinity;
    for(const p of this.points){
      const d=Math.hypot(x-p.x,y-p.y);
      if(d<p.r+10&&d<bestD){bestD=d;best=p.node}
    }
    return best;
  }
  bind(){
    const c=this.canvas;
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('wheel',e=>{
      e.preventDefault();
      const before=this.camera.zoom;
      this.camera.zoom=clamp(this.camera.zoom*Math.exp(-e.deltaY*.0012),.48,3.1);
      if(Math.abs(before-this.camera.zoom)>.01)this.callbacks.onZoom?.(this.camera.zoom);
      this.kick();
    },{passive:false});
    c.addEventListener('pointerdown',e=>{
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
      this.drag={x:e.offsetX,y:e.offsetY,button:e.button,moved:0};
    });
    c.addEventListener('pointermove',e=>{
      const p=this.pointers.get(e.pointerId);
      if(p&&this.drag){
        const dx=e.offsetX-p.x,dy=e.offsetY-p.y;
        this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
        this.drag.moved+=Math.abs(dx)+Math.abs(dy);
        if(e.shiftKey||this.drag.button===2||this.pointers.size>1){
          this.camera.panX+=dx;this.camera.panY+=dy;
        }else{
          this.camera.yaw-=dx*.006;
          // Pitch stays inside a shallow band: this is a map read from above,
          // not a flight simulator.
          this.camera.pitch=clamp(this.camera.pitch+dy*.005,-.95,.95);
        }
        this.kick();
      }else{
        const n=this.hit(e.offsetX,e.offsetY);
        if(n?.id!==this.hover?.id){this.hover=n;c.style.cursor=n?'pointer':'grab';this.applyState();this.kick()}
      }
    });
    c.addEventListener('pointerup',e=>{
      this.pointers.delete(e.pointerId);
      if(this.drag&&this.drag.moved<7){
        const n=this.hit(e.offsetX,e.offsetY);
        if(n){
          if(this.collapsed.has(n.id))this.toggleSubgraph(n.id);
          this.selected=n.id;this.applyState();
          this.callbacks.onSelect?.(n);this.kick();
        }
      }
      this.drag=null;
    });
    c.addEventListener('dblclick',e=>{
      const n=this.hit(e.offsetX,e.offsetY);
      if(!n)return;
      const kids=this.childIndex().get(n.id);
      if(kids&&kids.length>CHILD_LIMIT){this.toggleSubgraph(n.id);return}
      this.callbacks.onOpen?.(n);
    });
    c.addEventListener('keydown',e=>{
      if(e.key==='ArrowLeft')this.camera.yaw-=.14;
      if(e.key==='ArrowRight')this.camera.yaw+=.14;
      if(e.key==='ArrowUp')this.camera.pitch=clamp(this.camera.pitch-.12,-.95,.95);
      if(e.key==='ArrowDown')this.camera.pitch=clamp(this.camera.pitch+.12,-.95,.95);
      if(e.key==='+')this.zoom(1.15);
      if(e.key==='-')this.zoom(.87);
      if(e.key==='Enter'&&this.selected)this.toggleSubgraph(this.selected);
      this.kick();
    });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{
      this.reduced=e.matches;
      this.nodeMat.uniforms.uReduced.value=e.matches?1:0;
      if(this.reduced)this.orbit=false;
      this.kick();
    });
  }

  // ---------- loop ----------
  kick(){if(!this.frame)this.frame=requestAnimationFrame(t=>this.loop(t))}
  loop(t){
    this.frame=0;
    const dt=this.last?Math.min(40,t-this.last):16;
    this.last=t;
    if(this.orbit&&!this.reduced)this.camera.yaw+=dt*.00006;
    this.draw(t);
    const animating=this.orbit||(!this.reduced&&(this.view?.edges||[]).length>0);
    if(animating)this.kick();else this.last=0;
  }
  draw(now=performance.now()){
    if(!this.w||!this.h)return;
    this.syncCamera();
    const time=now*.001;
    this.nodeMat.uniforms.uTime.value=time;
    this.edgeMat.uniforms.uTime.value=time;
    // Zoomed out, pulses become noise and cost fill rate: fade them down.
    this.edgeMat.uniforms.uDetail.value=this.reduced?0:clamp((this.camera.zoom-.5)/.6,0,1);
    this.edgeMat.uniforms.uIntensity.value=this.pulseIntensity;
    this.renderer.render(this.scene,this.three);
    this.points=this.screenPoints();
    this.labels.render(this.points,{
      width:this.w,height:this.h,
      semanticView:this.view?.semanticView,
      selected:this.selected,hover:this.hover?.id,focus:this.focus,
      related:this.relatedSet,
      onSelect:node=>{this.selected=node.id;this.applyState();this.callbacks.onSelect?.(node);this.kick()}
    });
  }
  destroy(){
    this.resizeObserver?.disconnect();
    this.labels?.destroy();
    this.labelHost?.remove();
    this.renderer?.dispose();
  }
}
