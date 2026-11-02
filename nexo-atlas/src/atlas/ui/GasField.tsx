import {useEffect, useRef} from 'react';

/**
 * Volumetric blue gas (raw WebGL1, ray-marched fbm) behind the public page.
 * Each public section is a "shot": the camera cuts to a new position with a short flash
 * instead of drifting smoothly. Decorative only: aria-hidden, no data, no network.
 * Stops when paused, hidden, offscreen-tab, reduced motion or when the GPU can't keep up;
 * the static illustration underneath stays as the fallback.
 */
type Shot = {cam: [number, number, number]; look: [number, number, number]; density: number; swirl: number};
const SHOTS: Shot[] = [
  {cam: [0.0, 0.0, -6.5], look: [1.6, 0.2, 0.0], density: 0.62, swirl: 0.0},   // hero
  {cam: [4.6, 1.8, -3.6], look: [-0.4, -0.2, 1.8], density: 0.52, swirl: 1.2}, // research
  {cam: [-5.4, -1.2, 0.4], look: [1.8, 0.6, 0.8], density: 0.72, swirl: 2.4},  // lines
  {cam: [0.4, 5.6, -1.4], look: [0.0, -0.4, 1.2], density: 0.48, swirl: 3.6},  // methods
  {cam: [0.0, -0.6, -9.5], look: [0.0, 0.0, 0.0], density: 0.82, swirl: 4.8},  // contact
];

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `
precision mediump float;
uniform vec2 uRes;uniform float uTime;uniform float uMix;uniform float uCut;uniform float uDark;uniform vec2 uPointer;
uniform vec3 uCamA;uniform vec3 uCamB;uniform vec3 uLookA;uniform vec3 uLookB;uniform vec2 uDensSwirlA;uniform vec2 uDensSwirlB;
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
 float e=uMix;
 vec3 cam=mix(uCamA,uCamB,e);vec3 look=mix(uLookA,uLookB,e);vec2 ds=mix(uDensSwirlA,uDensSwirlB,e);
 cam.xy+=uPointer*.6;
 vec3 f=normalize(look-cam);vec3 r=normalize(cross(vec3(0,1,0),f));vec3 u=cross(f,r);
 vec3 rd=normalize(f*(1.1+uCut*.8)+uv.x*r+uv.y*u);
 float T=uTime*.06;
 vec3 light=look+vec3(sin(T*2.)*.8,cos(T*1.3)*.5,0.);
 float t=1.,trans=1.;vec3 col=vec3(0.);
 vec3 blue=vec3(.118,.357,1.),hi=vec3(.62,.74,1.),deep=vec3(.01,.04,.2);
 for(int i=0;i<24;i++){
  vec3 p=cam+rd*t;
  vec3 q=p;q.xz=rot(ds.y+T*.5)*q.xz;q.xy=rot(.35*sin(T+ds.y))*q.xy;
  float shell=exp(-dot(q,q)*.03);
  float n=fbm(q*.5+vec3(0.,T,-T*.7));
  float d=smoothstep(.5-ds.x*.14,.82-ds.x*.1,n)*shell;
  if(d>.003){
   vec3 L=light-p;float ld=dot(L,L);
   float glow=1.6/(1.+ld*.22);
   float edge=clamp(n-fbm(q*.5+normalize(L)*.3+vec3(0.,T,-T*.7)),-.2,.25)*3.+.4;
   vec3 c=mix(deep,blue,clamp(edge+glow*.5,0.,1.))+hi*glow*glow*.8;
   float a=d*.34;
   col+=trans*a*c;trans*=1.-a;
   if(trans<.04)break;
  }
  t+=.5+t*.05;
 }
 vec3 core=look-cam;float cd=max(0.,dot(normalize(core),rd));
 col+=hi*pow(cd,90.)*.5*trans;
 col+=hi*uCut*.45*(1.-trans);
 float acc=1.-trans;
 // dark: emissive gas; light: blue ink on white. Premultiplied alpha.
 vec3 ink=mix(vec3(.03,.16,.72),vec3(.12,.36,1.),clamp(col.b,0.,1.));
 vec3 outc=mix(ink*acc*.34,col*.85,uDark);
 float a=mix(acc*.34,.85*max(acc,max(col.r,max(col.g,col.b))),uDark);
 gl_FragColor=vec4(min(outc,vec3(a)),a);
}`;

const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

export default function GasField({scene, paused, dark}: {scene: number; paused: boolean; dark: boolean}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<{setScene: (n: number) => void; setPaused: (p: boolean) => void; setDark: (d: boolean) => void} | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const force = new URLSearchParams(location.search).has('gl');
    const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: !force});
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {res: U('uRes'), time: U('uTime'), mix: U('uMix'), cut: U('uCut'), dark: U('uDark'), pointer: U('uPointer'),
      camA: U('uCamA'), camB: U('uCamB'), lookA: U('uLookA'), lookB: U('uLookB'), dsA: U('uDensSwirlA'), dsB: U('uDensSwirlB')};

    const host = canvas.parentElement!;
    let from = SHOTS[0], to = SHOTS[0], cutAt = -10, elapsed = 0, last = performance.now(), frame = 0;
    let isPaused = paused, isDark = dark, alive = true, slow = 0, frames = 0, tooSlow = false;
    const pointer = {x: 0, y: 0, tx: 0, ty: 0};
    const scale = window.innerWidth < 700 ? 0.38 : 0.5;
    const resize = () => {
      const w = Math.max(1, Math.round(innerWidth * scale)), h = Math.max(1, Math.round(innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    };
    const draw = () => {
      const k = Math.min(1, (elapsed - cutAt) / 1.1), mixV = easeOutExpo(k), cut = Math.max(0, 1 - (elapsed - cutAt) / 0.7);
      pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
      gl.uniform2f(u.res, canvas.width, canvas.height); gl.uniform1f(u.time, elapsed);
      gl.uniform1f(u.mix, mixV); gl.uniform1f(u.cut, cut * cut); gl.uniform1f(u.dark, isDark ? 1 : 0);
      gl.uniform2f(u.pointer, pointer.x, pointer.y);
      gl.uniform3fv(u.camA, from.cam); gl.uniform3fv(u.camB, to.cam); gl.uniform3fv(u.lookA, from.look); gl.uniform3fv(u.lookB, to.look);
      gl.uniform2f(u.dsA, from.density, from.swirl); gl.uniform2f(u.dsB, to.density, to.swirl);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const running = () => alive && !isPaused && !reduce.matches && !document.hidden && !tooSlow;
    const loop = (now: number) => {
      frame = 0;
      if (!running()) return;
      const raw = (now - last) / 1000; last = now; elapsed += Math.min(raw, 0.05);
      if (++frames > 4 && frames < 160 && !force) { slow = raw > 0.05 ? slow + 1 : Math.max(0, slow - 1); if (slow > 8 || raw > 0.25) { tooSlow = true; host.dataset.gl = 'still'; return; } }
      draw(); frame = requestAnimationFrame(loop);
    };
    const kick = () => { if (!frame && running()) { last = performance.now(); frame = requestAnimationFrame(loop); } else if (!running()) draw(); };
    resize(); draw(); host.dataset.gl = 'on'; kick();

    api.current = {
      setScene: (n) => { const next = SHOTS[Math.max(0, Math.min(SHOTS.length - 1, n))]; if (next === to) return; from = to; to = next; cutAt = elapsed; if (!running()) { cutAt = elapsed - 2; draw(); } },
      setPaused: (p) => { isPaused = p; kick(); },
      setDark: (d) => { isDark = d; draw(); kick(); },
    };
    const onResize = () => { resize(); draw(); };
    const onMove = (e: PointerEvent) => { pointer.tx = (e.clientX / innerWidth - 0.5); pointer.ty = -(e.clientY / innerHeight - 0.5); };
    window.addEventListener('resize', onResize); window.addEventListener('pointermove', onMove, {passive: true});
    document.addEventListener('visibilitychange', kick); reduce.addEventListener('change', kick);
    const lost = (e: Event) => { e.preventDefault(); alive = false; cancelAnimationFrame(frame); delete host.dataset.gl; };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      alive = false; cancelAnimationFrame(frame); api.current = null; delete host.dataset.gl;
      window.removeEventListener('resize', onResize); window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', kick); reduce.removeEventListener('change', kick);
      canvas.removeEventListener('webglcontextlost', lost);
    };
  }, []);

  useEffect(() => { api.current?.setScene(scene); }, [scene]);
  useEffect(() => { api.current?.setPaused(paused); }, [paused]);
  useEffect(() => { api.current?.setDark(dark); }, [dark]);
  return <canvas ref={canvasRef} className="nexo-gas-field" aria-hidden="true"/>;
}
