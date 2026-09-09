// NEXO Atlas graph engine — WebGL (Three.js) renderer.
//
// The public surface is unchanged from the canvas-2D engine it replaces:
//   new AtlasEngine(canvas,{onSelect,onOpen,onZoom})
//   .camera.zoom  .setData()  .setSelected()  .focusSelected()
//   .setZoom()  .zoom()  .reset()  .toggleFlat()  .toggleOrbit()
// layoutGraph/labelPolicy are re-exported so existing imports keep working.

import * as THREE from '../vendor/three.module.min.js';
import {layoutGraph,labelPolicy,LINEAGE_BREAKPOINT,depthRank,systemIndex} from './layout.mjs';
import {LabelLayer} from './labels.mjs';

export {layoutGraph,labelPolicy};

// Identity is carried by the owning system, not by the node's type: a whole
// branch shares one hue, so the map reads as constellations rather than as a
// rainbow of unrelated categories.
export const SYSTEM_COLOR={
  NEXO:'#E8C982',SCIENCE:'#66c2ff',LEARNING:'#b874ff',OPERATIONS:'#7f9db8',
  ENGINEERING:'#7f9db8',OLYMPUS:'#51d1b0',BLACK_BOX:'#d860a8',BLACKBOX:'#d860a8'
};
const FALLBACK_SYSTEM='#9fb2c6';

// Kept for shape and danger classification, and asserted by the frontend tests.
export const TYPE_COLOR={SYSTEM:'#8db7ff',DOMAIN:'#66d6ff',PROJECT:'#66d6ff',CAMPAIGN:'#967cff',HYPOTHESIS:'#f17ec2',DECISION_HYPOTHESIS:'#f17ec2',CLAIM:'#e983c2',TEST:'#70e6bd',RESULT:'#ffd06b',DATASET:'#8da4ff',MODEL:'#b895ff',PROBE:'#73cfff',PUBLICATION:'#f4a66e',SOURCE:'#c9d4e8',SOURCE_REF:'#8b98af'};
export const STATUS_DANGER=/blocked|kill|negative|contrad/i;
const DANGER_COLOR='#ff6d88';

// Three relation registers, in ascending visual weight. Only the two that carry
// meaning beyond structure get a travelling pulse.
const EDGE_STYLE={
  normal:{color:0x4a6075,opacity:.26,pulse:false},
  inference:{color:0x9a6dff,opacity:.44,pulse:true},
  learning:{color:0x6ca9ff,opacity:.64,pulse:true}
};
const INFERENCE_TYPES=new Set(['SUPPORTS','CONTRADICTS','KILLS','TESTS','VALIDATES','PRODUCES','PRODUCES_RESULT','PRIMARY_TEST']);
const STRUCTURAL_TYPES=new Set(['CONTAINS','EXECUTED_AS','LOCATED_AT']);

const DIAMOND_TYPES=new Set(['HYPOTHESIS','CLAIM','DECISION_HYPOTHESIS','TEST','PROBE','DATASET']);

// A pulse is an object moving along a curve, so its cost is per-pulse CPU work.
// Capping the count keeps a dense graph from spending the frame on them.
const MAX_PULSES=260;
const CURVE_SEGMENTS=26;
const CHILD_LIMIT=14;
const FOV=20;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let h=0;for(const ch of String(s))h=(Math.imul(h,31)+ch.charCodeAt(0))|0;return Math.abs(h)};
const unit=(s,salt)=>(hash(salt+':'+s)%10000)/10000;

function nodeRadius(node,focus){
  if(node.id===focus)return 23;
  const t=node.visualType||node.type;
  if(t==='SYSTEM')return 15;
  if(t==='DOMAIN'||t==='PROJECT')return 10.5;
  if(t==='CAMPAIGN')return 8;
  if(t==='SOURCE'||t==='SOURCE_REF')return 5;
  return 6;
}

function edgeKind(edge,systems){
  const t=String(edge.type||'');
  if(STRUCTURAL_TYPES.has(t))return 'normal';
  const a=systems.get(edge.source),b=systems.get(edge.target);
  if(a==='LEARNING'||b==='LEARNING'||t==='ASSOCIATED_WITH')return 'learning';
  if(INFERENCE_TYPES.has(t))return 'inference';
  return 'normal';
}

const PULSE_VERT=`
attribute float aSize; attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
void main(){
  vColor=aColor;
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=aSize*uPixelRatio*(340.0/max(1.0,-mv.z));
  gl_Position=projectionMatrix*mv;
}`;
const PULSE_FRAG=`
precision mediump float;
varying vec3 vColor;
void main(){
  float d=length(gl_PointCoord*2.0-1.0);
  float core=1.0-smoothstep(0.0,0.45,d);
  float glow=1.0-smoothstep(0.2,1.0,d);
  float a=core+glow*0.42;
  if(a<0.01) discard;
  gl_FragColor=vec4(vColor*(0.9+core*0.6),a);
}`;

export class AtlasEngine{
  constructor(canvas,{onSelect,onOpen,onZoom}={}){
    this.canvas=canvas;
    this.callbacks={onSelect,onOpen,onZoom};
    this.camera={yaw:.16,pitch:-.07,zoom:.72,panX:0,panY:0,flat:false};
    this.graph={nodes:[],edges:[]};
    this.positions=new Map();this.points=[];
    this.selected=null;this.hover=null;this.focus='system:NEXO';
    this.layoutKey='';this.frame=0;this.last=0;this.orbit=false;
    this.collapsed=new Set();
    this.drag=null;this.pointers=new Map();
    this.pulsesOn=true;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    // A narrow field of view keeps the map close to orthographic. A wide lens
    // bends the outer rings and makes the same ring read as different depths.
    this.three=new THREE.PerspectiveCamera(FOV,1,1,9000);
    this.target=new THREE.Vector3(0,0,0);
    this.group=new THREE.Group();
    this.scene.add(this.group);

    this.sphereGeom=new THREE.SphereGeometry(1,18,12);
    this.octaGeom=new THREE.OctahedronGeometry(1,0);
    this.ringGeom=new THREE.RingGeometry(1.5,1.62,56);

    this.pulseGeom=new THREE.BufferGeometry();
    this.pulseMat=new THREE.ShaderMaterial({
      vertexShader:PULSE_VERT,fragmentShader:PULSE_FRAG,
      uniforms:{uPixelRatio:{value:1}},
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
    });
    this.pulseMesh=new THREE.Points(this.pulseGeom,this.pulseMat);
    this.pulseMesh.frustumCulled=false;
    this.scene.add(this.pulseMesh);

    this.buildStars();
  }
  buildStars(){
    const count=360,pos=new Float32Array(count*3),size=new Float32Array(count),col=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      pos[i*3]=(unit(i,'sx')-.5)*4200;
      pos[i*3+1]=(unit(i,'sy')-.5)*2800;
      pos[i*3+2]=-1800-unit(i,'sz')*2200;
      size[i]=i%17===0?2.6:1.4;
      const t=.55+unit(i,'st')*.45;
      col[i*3]=.72*t;col[i*3+1]=.80*t;col[i*3+2]=.95*t;
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('aSize',new THREE.BufferAttribute(size,1));
    g.setAttribute('aColor',new THREE.BufferAttribute(col,3));
    this.starMesh=new THREE.Points(g,this.pulseMat);
    this.starMesh.frustumCulled=false;
    this.scene.add(this.starMesh);
  }
  initLabels(){
    const host=document.createElement('div');
    host.className='atlas-label-layer';
    (this.canvas.parentElement||document.body).appendChild(host);
    this.labelHost=host;
    this.labels=new LabelLayer(host);
  }

  // ---------- graph shaping ----------
  childIndex(){
    if(this._childIndex&&this._childKey===this.graph)return this._childIndex;
    const kids=new Map();
    for(const n of this.graph.nodes||[]){
      if(!n.parentId)continue;
      if(!kids.has(n.parentId))kids.set(n.parentId,[]);
      kids.get(n.parentId).push(n.id);
    }
    this._childIndex=kids;this._childKey=this.graph;
    return kids;
  }
  hiddenIds(){
    const kids=this.childIndex(),hidden=new Set();
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
    const kids=this.childIndex();
    if((this.graph.nodes||[]).length<=CHILD_LIMIT*3)return;
    for(const n of this.graph.nodes||[]){
      const list=kids.get(n.id);
      if(list&&list.length>CHILD_LIMIT&&depthRank(n)>=2)this.collapsed.add(n.id);
    }
  }
  hiddenChildCount(id){
    const kids=this.childIndex();let total=0;
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

  colorFor(node){
    if(STATUS_DANGER.test(String(node.status||node.summary||'')))return DANGER_COLOR;
    return SYSTEM_COLOR[this.systems?.get(node.id)]||FALLBACK_SYSTEM;
  }

  // ---------- scene build ----------
  disposeGroup(){
    while(this.group.children.length){
      const o=this.group.children.pop();
      o.geometry?.dispose?.();
      if(o.material&&o.material!==this.pulseMat)o.material.dispose?.();
    }
  }
  reflow(force=false){
    const width=this.canvas.clientWidth||1024;
    const mode=width<LINEAGE_BREAKPOINT?'mobile':'desktop';
    const key=`${this.graph.semanticView||'macro'}:${mode}:${this.focus}:${[...this.collapsed].sort().join(',')}`;
    if(!force&&key===this.layoutKey)return false;
    this.layoutKey=key;
    this.view=this.visibleGraph();
    this.systems=systemIndex(this.view.nodes);
    this.positions=new Map(layoutGraph(this.view.nodes,{
      focus:this.focus,semanticView:this.view.semanticView,viewportWidth:width,edges:this.view.edges
    }).map(p=>[p.id,p]));
    this.measureContent();
    this.buildScene();
    return true;
  }
  // The rings are laid out in absolute world units, so the camera has to be
  // framed against the content that actually exists. Without this a sparse
  // graph puts everything outside the frustum and only the focus is visible.
  measureContent(){
    let rx=1,ry=1;
    for(const p of this.positions.values()){
      rx=Math.max(rx,Math.abs(p.x));
      ry=Math.max(ry,Math.abs(p.y));
    }
    const tan=Math.tan(FOV*Math.PI/360);
    const aspect=Math.max(.35,this.w/Math.max(1,this.h));
    const margin=1.22;
    this.fitDistance=clamp(Math.max(ry*margin/tan,rx*margin/(tan*aspect)),240,6000);
  }
  buildScene(){
    this.disposeGroup();
    const nodes=this.view?.nodes||[];
    const spheres=[],octas=[],rings=[];
    for(const n of nodes){
      const p=this.positions.get(n.id);
      if(!p)continue;
      const bucket=DIAMOND_TYPES.has(n.visualType||n.type)?octas:spheres;
      bucket.push({node:n,p});
      const t=n.visualType||n.type;
      if(t==='SYSTEM'||t==='PROJECT'||n.id===this.focus)rings.push({node:n,p});
    }
    this.instanced={};
    this.instanced.sphere=this.buildInstances(this.sphereGeom,spheres,.88);
    this.instanced.octa=this.buildInstances(this.octaGeom,octas,.84);
    this.instanced.ring=this.buildInstances(this.ringGeom,rings,.3,THREE.DoubleSide);
    this.buildEdges();
  }
  buildInstances(geom,items,opacity,side){
    if(!items.length)return null;
    const mat=new THREE.MeshBasicMaterial({transparent:true,opacity,side:side||THREE.FrontSide,depthWrite:false});
    const mesh=new THREE.InstancedMesh(geom,mat,items.length);
    mesh.frustumCulled=false;
    const m=new THREE.Matrix4(),c=new THREE.Color();
    items.forEach((item,i)=>{
      const r=nodeRadius(item.node,this.focus);
      m.makeScale(r,r,r);
      m.setPosition(item.p.x,item.p.y,item.p.z);
      mesh.setMatrixAt(i,m);
      c.set(this.colorFor(item.node));
      mesh.setColorAt(i,c);
    });
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.userData.items=items;
    this.group.add(mesh);
    return mesh;
  }
  curveFor(a,b,kind){
    const A=new THREE.Vector3(a.x,a.y,a.z),B=new THREE.Vector3(b.x,b.y,b.z);
    const mid=A.clone().lerp(B,.5);
    const dx=B.x-A.x,dy=B.y-A.y;
    const bend=kind==='learning'?.18:kind==='inference'?.13:.08;
    mid.x+=-dy*bend;mid.y+=dx*bend;mid.z+=kind==='learning'?18:8;
    return new THREE.QuadraticBezierCurve3(A,mid,B);
  }
  buildEdges(){
    const edges=this.view?.edges||[];
    const buckets={normal:[],inference:[],learning:[]};
    this.pulses=[];
    for(const e of edges){
      const a=this.positions.get(e.source),b=this.positions.get(e.target);
      if(!a||!b)continue;
      const kind=edgeKind(e,this.systems);
      const curve=this.curveFor(a,b,kind);
      buckets[kind].push(curve);
      if(EDGE_STYLE[kind].pulse&&this.pulses.length<MAX_PULSES&&!this.reduced){
        const key=e.id||`${e.source}->${e.target}`;
        const count=unit(key,'n')>.62?2:1;
        for(let i=0;i<count&&this.pulses.length<MAX_PULSES;i++){
          this.pulses.push({
            curve,
            phase:(unit(key+i,'p')*.9+i/count)%1,
            speed:.055+unit(key+i,'s')*.05,
            color:new THREE.Color(EDGE_STYLE[kind].color).lerp(new THREE.Color(0xffffff),.45),
            size:kind==='learning'?3.4:2.6
          });
        }
      }
    }
    for(const [kind,curves] of Object.entries(buckets)){
      if(!curves.length)continue;
      const style=EDGE_STYLE[kind];
      const verts=[];
      for(const curve of curves){
        const pts=curve.getPoints(CURVE_SEGMENTS);
        for(let i=0;i<pts.length-1;i++){
          verts.push(pts[i].x,pts[i].y,pts[i].z,pts[i+1].x,pts[i+1].y,pts[i+1].z);
        }
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(verts),3));
      const mat=new THREE.LineBasicMaterial({color:style.color,transparent:true,opacity:style.opacity,depthWrite:false});
      const lines=new THREE.LineSegments(g,mat);
      lines.frustumCulled=false;
      lines.userData.kind=kind;
      this.group.add(lines);
    }
    this.rebuildPulseBuffer();
  }
  rebuildPulseBuffer(){
    const n=this.pulses?.length||0;
    const pos=new Float32Array(Math.max(1,n)*3),size=new Float32Array(Math.max(1,n)),col=new Float32Array(Math.max(1,n)*3);
    for(let i=0;i<n;i++){
      size[i]=this.pulses[i].size;
      const c=this.pulses[i].color;
      col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;
    }
    const g=this.pulseGeom;
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('aSize',new THREE.BufferAttribute(size,1));
    g.setAttribute('aColor',new THREE.BufferAttribute(col,3));
    g.setDrawRange(0,n);
    this.pulsePositions=pos;
  }
  advancePulses(dt){
    if(!this.pulses?.length||!this.pulsesOn||this.reduced)return;
    const pos=this.pulsePositions,v=new THREE.Vector3();
    for(let i=0;i<this.pulses.length;i++){
      const p=this.pulses[i];
      p.phase=(p.phase+p.speed*dt)%1;
      p.curve.getPoint(p.phase,v);
      pos[i*3]=v.x;pos[i*3+1]=v.y;pos[i*3+2]=v.z;
    }
    this.pulseGeom.getAttribute('position').needsUpdate=true;
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
    const active=this.selected||this.hover?.id;
    this.relatedSet=this.relatedTo(active);
    const dim=new THREE.Color('#26313d'),c=new THREE.Color();
    for(const mesh of [this.instanced?.sphere,this.instanced?.octa]){
      if(!mesh)continue;
      mesh.userData.items.forEach((item,i)=>{
        const faded=active&&!this.relatedSet.has(item.node.id);
        c.set(faded?dim:new THREE.Color(this.colorFor(item.node)));
        mesh.setColorAt(i,c);
      });
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }

  // ---------- camera ----------
  resize(){
    const w=this.canvas.clientWidth||1024,h=this.canvas.clientHeight||720;
    this.w=w;this.h=h;
    const dpr=Math.min(devicePixelRatio||1,2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w,h,false);
    this.pulseMat.uniforms.uPixelRatio.value=dpr;
    this.three.aspect=w/h;
    this.three.updateProjectionMatrix();
    this.measureContent();
    if(this.labelHost){this.labelHost.style.width=`${w}px`;this.labelHost.style.height=`${h}px`}
  }
  distance(){return clamp((this.fitDistance||900)*(.72/Math.max(.05,this.camera.zoom)),200,9000)}
  syncCamera(){
    const c=this.camera;
    const pitch=c.flat?0:c.pitch,yaw=c.flat?0:c.yaw,dist=this.distance();
    this.target.set(-c.panX*1.1,c.panY*1.1,0);
    this.three.position.set(
      this.target.x+Math.sin(yaw)*dist,
      this.target.y+Math.sin(-pitch)*dist*.6,
      this.target.z+Math.cos(yaw)*dist
    );
    this.three.lookAt(this.target);
    this.three.updateMatrixWorld();
  }
  setZoom(value){this.camera.zoom=clamp(value,.34,3.1);this.callbacks.onZoom?.(this.camera.zoom);this.kick()}
  zoom(f){this.setZoom(this.camera.zoom*f)}
  reset(){
    const view=this.graph.semanticView;
    Object.assign(this.camera,{yaw:.16,pitch:-.07,panX:0,panY:0,
      zoom:view==='macro'?.72:view==='provenance'?2.1:1.2});
    this.callbacks.onZoom?.(this.camera.zoom);this.kick();
  }
  toggleFlat(){this.camera.flat=!this.camera.flat;this.kick();return this.camera.flat}
  toggleOrbit(){if(this.reduced)return false;this.orbit=!this.orbit;this.kick();return this.orbit}
  togglePulses(){this.pulsesOn=!this.pulsesOn;this.pulseMesh.visible=this.pulsesOn;this.kick();return this.pulsesOn}
  focusSelected(){
    const p=this.positions.get(this.selected);
    if(!p)return;
    this.camera.panX=-p.x/1.1;this.camera.panY=p.y/1.1;
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
  pixelsPerUnit(){
    return (this.h/2)/(this.distance()*Math.tan(FOV*Math.PI/360));
  }
  screenPoints(){
    const out=[],v=new THREE.Vector3(),ppu=this.pixelsPerUnit();
    for(const node of this.view?.nodes||[]){
      const p=this.positions.get(node.id);
      if(!p)continue;
      v.set(p.x,p.y,p.z).project(this.three);
      if(v.z<-1||v.z>1)continue;
      const x=(v.x*.5+.5)*this.w,y=(-v.y*.5+.5)*this.h;
      if(x<-140||y<-140||x>this.w+140||y>this.h+140)continue;
      out.push({id:node.id,node,x,y,r:Math.max(3,nodeRadius(node,this.focus)*ppu),depth:v.z,visible:true,color:this.colorFor(node)});
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
      this.camera.zoom=clamp(this.camera.zoom*Math.exp(-e.deltaY*.0012),.34,3.1);
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
          this.camera.yaw-=dx*.004;
          // Shallow pitch band: this is a map read from slightly above, not a
          // free-flight camera that can end up under the graph.
          this.camera.pitch=clamp(this.camera.pitch+dy*.003,-.30,.30);
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
      if(e.key==='ArrowLeft')this.camera.yaw-=.12;
      if(e.key==='ArrowRight')this.camera.yaw+=.12;
      if(e.key==='ArrowUp')this.camera.pitch=clamp(this.camera.pitch-.06,-.30,.30);
      if(e.key==='ArrowDown')this.camera.pitch=clamp(this.camera.pitch+.06,-.30,.30);
      if(e.key==='+')this.zoom(1.15);
      if(e.key==='-')this.zoom(.87);
      if(e.key==='Enter'&&this.selected)this.toggleSubgraph(this.selected);
      this.kick();
    });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{
      this.reduced=e.matches;
      if(this.reduced)this.orbit=false;
      this.reflow(true);this.kick();
    });
  }

  // ---------- loop ----------
  kick(){if(!this.frame)this.frame=requestAnimationFrame(t=>this.loop(t))}
  loop(t){
    this.frame=0;
    const dt=this.last?Math.min(.04,(t-this.last)/1000):.016;
    this.last=t;
    if(this.orbit&&!this.reduced)this.camera.yaw+=dt*.05;
    this.advancePulses(dt);
    this.draw();
    const animating=this.orbit||(this.pulsesOn&&!this.reduced&&(this.pulses?.length||0)>0);
    if(animating)this.kick();else this.last=0;
  }
  draw(){
    if(!this.w||!this.h)return;
    this.syncCamera();
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
    this.disposeGroup();
    this.renderer?.dispose();
  }
}
