// WebGL renderer of the Tower web (three.js): ONE ribbon mesh for every strand of every real edge (camera-facing ribbons expanded in the vertex shader,
// soft tapered fibres), ONE point batch of density grains riding those strands, and ONE point batch for the nodes (diffuse knots by real degree). Three draw calls per frame, no post-processing, no bloom, no grain, no
// background decoration: depth comes from perspective width, tube lighting and depth attenuation.
// The stacked 2D canvas keeps labels, rings, the observation box and picking, so the GL camera reproduces camera3d.project() exactly.
// Returns null without WebGL2: the Canvas fallback (draw2d.ts) draws the same scene from the same arrays.
import {AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Matrix4, Mesh, NormalBlending, PerspectiveCamera, Points, Scene as ThreeScene, ShaderMaterial, Vector3, WebGLRenderer} from 'three';
import type {Filaments} from './filaments.ts';
import type {Camera} from './camera3d.ts';
import {SELECTED_SIZE, type Scene, type Style} from './scene.ts';
import {TOKENS, type Theme} from './palette.ts';

export interface GlState {
  cam: Camera; w: number; h: number; dpr: number; theme: Theme; style: Style;
  selected: number | null; hover: number | null;
  /** full-size knots (high quality); low quality draws them smaller */
  halo: boolean;
  /** node positions changed since the last render (illustrative motion) */
  moved: boolean;
  /** the filament curves were recomputed since the last render */
  filamentsMoved: boolean;
}
export interface GlInfo {calls: number; points: number; triangles: number}
export interface GlCosmos {load(s: Scene, f: Filaments): void; render(s: GlState): GlInfo; dispose(): void}

// depth attenuation of the same blue: the near side of the volume is fully lit, the far side falls to a sixth
const FOG = /* glsl */`float fog(float d){ float t = clamp((d - uDmin) / uSpan, 0.0, 1.0); return mix(1.0, 0.16, t * t * (3.0 - 2.0 * t)); }`;
// Nodes are diffuse knots of light, not dots: a soft nucleus whose size and strength follow the real degree of the node (a leaf is a faint grain,
// a hub is a bright core). Hover and selection add a small crisp centre so a single node can still be read.
const POINT_VS = /* glsl */`
uniform float uDpr, uDmin, uSpan, uSel, uDist, uGlow; attribute float aSize, aAlpha, aMark; varying float vA, vMark, vCore;
${FOG}
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z, f = fog(d);
  float w = clamp((aSize - 1.5) / 3.5, 0.0, 1.0);                 // 0 for a leaf .. 1 for the largest hubs (real degree, capped)
  float persp = clamp(uDist / max(d, 0.001), 0.45, 2.6);
  float px = (3.0 + 12.0 * w * w + 6.0 * w) * uGlow * persp; float core = aMark > 1.5 ? uSel : aMark > 0.5 ? aSize + 1.0 : aSize * 0.5;
  px = max(px, core * 2.4); gl_PointSize = px * uDpr; vCore = core / px; vMark = aMark;
  vA = aAlpha * (aMark > 0.5 ? 1.0 : f) * (0.08 + 0.7 * w * w + 0.15 * w);
}`;
const POINT_FS = /* glsl */`
uniform vec3 uColor, uHot; uniform float uInk; varying float vA, vMark, vCore;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0; float glow = exp(-d * d * 8.5) - 0.0002; float core = 1.0 - smoothstep(vCore * 0.7, vCore * 1.25, d);
  float m = vMark > 0.5 ? 1.0 : 0.0; float a = clamp(glow * vA + core * mix(vA * 0.9, 1.0, m), 0.0, 1.0); if (a < 0.004) discard;
  // on black the heart of a knot is lit; on white it is the deep ink
  gl_FragColor = vec4(mix(uColor, uHot, clamp(glow * 1.3 * mix(0.75, 0.35, uInk) + core * 0.6, 0.0, 1.0)), a * mix(1.0, 0.8, uInk));
}`;
// Ribbons: each strand vertex is pushed sideways, in view space, perpendicular to the strand and to the eye, by half its width. The width is in
// world units, so near strands are thick and far ones thin; below one pixel the ribbon keeps one pixel and fades instead (no shimmering).
const RIBBON_VS = /* glsl */`
uniform float uDmin, uSpan, uFocal, uMinPx, uBase, uFocus; attribute vec3 aTangent; attribute float aSide, aWidth, aAlong, aGain, aAlpha; varying float vX, vA; varying vec3 vSide;
${FOG}
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 t = normalize(mat3(modelViewMatrix) * aTangent); vec3 eye = normalize(-mv.xyz);
  vec3 side = cross(t, eye); float sl = length(side); side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  // a strand is a tapered fibre: slim where it leaves a node, fullest along the corridor
  float body = 0.4 + 0.6 * pow(sin(3.14159265 * aAlong), 0.7);
  float pxPerUnit = uFocal / max(0.001, -mv.z); float px = aWidth * body * pxPerUnit; float shown = max(px, uMinPx);
  mv.xyz += side * aSide * 0.5 * shown / pxPerUnit; gl_Position = projectionMatrix * mv;
  // no abrupt ends: a strand fades in from the node it leaves and out into the node it reaches; sub-pixel strands fade further instead of drawing a hard hairline
  float ends = 0.3 + 0.7 * pow(sin(3.14159265 * aAlong), 0.55);
  // strands are the internal structure, not the picture: almost invisible, except those of the selected node (opacity 1 while a selection exists)
  float lift = mix(uBase, 1.0, uFocus * step(0.99, aAlpha));
  vX = aSide; vSide = side; vA = aAlpha * aGain * ends * lift * fog(-mv.z) * clamp(px / uMinPx, 0.1, 1.0);
}`;
const RIBBON_FS = /* glsl */`
uniform vec3 uColor, uHot, uLight; uniform float uOpacity, uInk; varying float vX, vA; varying vec3 vSide;
void main(){
  // a soft column of matter: dense along its axis, fading outward, gently lit from one side like a round body
  float x = clamp(vX, -1.0, 1.0); float z = sqrt(max(0.0, 1.0 - x * x)); vec3 n = normalize(vSide * x + vec3(0.0, 0.0, 1.0) * z); float lambert = max(0.0, dot(n, uLight));
  float body = exp(-x * x * 3.4); float a = body * mix(0.6 + 0.45 * lambert, 0.7 + 0.35 * (1.0 - lambert), uInk) * vA * uOpacity; if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uColor, uHot, body * body * vA * mix(0.55, 0.4, uInk)), a);
}`;
// The cloud: soft density puffs of several sizes around the strands, inside the real corridors. Each puff is a round billboard with a gaussian
// falloff and no edge; thousands of them add up to translucent matter that is denser along trunks and at knots. Artistic density, not records.
const DUST_VS = /* glsl */`
uniform float uDmin, uSpan, uDpr, uFocal, uMaxPx; attribute float aSize, aGain, aAlpha; varying float vA;
${FOG}
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(0.001, -mv.z);
  float px = 2.0 * aSize * uFocal / d; float shown = clamp(px, 1.6, uMaxPx);
  // a puff clipped to the size limit keeps its total light; a sub-pixel one fades
  gl_PointSize = shown * uDpr; vA = aAlpha * aGain * fog(d) * min(1.0, px / 1.6) * min(1.0, (px * px) / (shown * shown) + 0.35);
}`;
const DUST_FS = /* glsl */`
uniform vec3 uColor, uHot; uniform float uOpacity, uInk; varying float vA;
void main(){ vec2 c = (gl_PointCoord - 0.5) * 2.0; float r2 = dot(c, c); float g = exp(-r2 * 6.4) - 0.0017; /* a defined core with a short soft edge: neighbouring densities stay separate */ float a = g * vA * uOpacity; if (a < 0.0025) discard; gl_FragColor = vec4(mix(uColor, uHot, clamp(g * vA * mix(0.9, 0.5, uInk), 0.0, 1.0)), a); }`;

const R = new Matrix4(), Rinv = new Matrix4(), Ry = new Matrix4();
/** Makes a three.js camera reproduce camera3d exactly: view = Rx(pitch) Ry(yaw) (p - target) + (0, 0, -dist), focal length in pixels. */
export function syncCamera(camera: PerspectiveCamera, c: Camera, w: number, h: number, extent: number): void {
  R.makeRotationX(c.pitch); Ry.makeRotationY(c.yaw); R.multiply(Ry); Rinv.copy(R).transpose();
  camera.quaternion.setFromRotationMatrix(Rinv); camera.position.set(0, 0, c.dist).applyMatrix4(Rinv).add(new Vector3(c.target.x, c.target.y, c.target.z));
  camera.fov = 2 * Math.atan(h / (2 * c.focal)) * 180 / Math.PI; camera.aspect = w / h; camera.near = Math.max(0.5, c.dist * 0.02); camera.far = c.dist + extent * 6; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}

export function createGlCosmos(canvas: HTMLCanvasElement): GlCosmos | null {
  // probe first: three.js logs an error when it cannot create a context, and "no WebGL2" is an expected, handled state here
  const attrs = {antialias: true, alpha: false, powerPreference: 'high-performance' as const};
  let context: WebGL2RenderingContext | null = null; try { context = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null; } catch { context = null; }
  if (!context) return null;
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({canvas, context, ...attrs}); } catch { return null; }
  renderer.info.autoReset = false;
  const maxPoint = Math.min(256, (context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] ?? 64);
  const scene = new ThreeScene(), camera = new PerspectiveCamera(40, 1, 1, 1000);
  const shared = {uDmin: {value: 0}, uSpan: {value: 1}};
  const pointMat = new ShaderMaterial({vertexShader: POINT_VS, fragmentShader: POINT_FS, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {...shared, uDpr: {value: 1}, uSel: {value: SELECTED_SIZE}, uDist: {value: 1}, uGlow: {value: 1}, uInk: {value: 0}, uColor: {value: new Color()}, uHot: {value: new Color()}}});
  const ribbonMat = new ShaderMaterial({vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide,
    uniforms: {...shared, uColor: {value: new Color()}, uHot: {value: new Color()}, uOpacity: {value: 1}, uInk: {value: 0}, uBase: {value: 0.1}, uFocus: {value: 0}, uFocal: {value: 1}, uMinPx: {value: 1}, uLight: {value: new Vector3(-0.42, 0.58, 0.7).normalize()}}});
  const dustMat = new ShaderMaterial({vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {...shared, uColor: {value: new Color()}, uHot: {value: new Color()}, uOpacity: {value: 1}, uInk: {value: 0}, uDpr: {value: 1}, uFocal: {value: 1}, uMaxPx: {value: 72}}});
  let points: Points | null = null, dust: Points | null = null, ribbons: Mesh | null = null, cur: Scene | null = null, fil: Filaments | null = null;
  let lastW = 0, lastH = 0, lastDpr = 0, lastTheme: Theme | null = null, lastStyle: Style | null = null, lastSel = -2, lastHover = -2;
  const dyn = (a: Float32Array, n: number) => { const at = new BufferAttribute(a, n); at.setUsage(35048 /* DYNAMIC_DRAW */); return at; };
  const clear = () => { for (const o of [points, ribbons, dust]) if (o) { scene.remove(o); o.geometry.dispose(); } points = null; ribbons = null; dust = null; };

  const load = (s: Scene, f: Filaments) => {
    clear(); cur = s; fil = f; lastStyle = null; lastSel = lastHover = -2;
    const N = s.nodes.length;
    const pg = new BufferGeometry(); pg.setAttribute('position', dyn(s.xyz, 3)); pg.setAttribute('aSize', new BufferAttribute(s.size, 1)); pg.setAttribute('aAlpha', dyn(new Float32Array(N).fill(1), 1)); pg.setAttribute('aMark', dyn(new Float32Array(N), 1));
    points = new Points(pg, pointMat); points.frustumCulled = false; points.renderOrder = 2;
    const rg = new BufferGeometry(); rg.setAttribute('position', dyn(f.pos, 3)); rg.setAttribute('aTangent', dyn(f.tan, 3));
    rg.setAttribute('aSide', new BufferAttribute(f.side, 1)); rg.setAttribute('aWidth', new BufferAttribute(f.width, 1)); rg.setAttribute('aAlong', new BufferAttribute(f.along, 1)); rg.setAttribute('aGain', new BufferAttribute(f.gain, 1));
    rg.setAttribute('aAlpha', dyn(new Float32Array(f.side.length).fill(1), 1)); rg.setIndex(new BufferAttribute(f.index, 1));
    ribbons = new Mesh(rg, ribbonMat); ribbons.frustumCulled = false; ribbons.renderOrder = 1;
    const dg = new BufferGeometry(); dg.setAttribute('position', dyn(f.dust, 3)); dg.setAttribute('aSize', new BufferAttribute(f.dustSize, 1)); dg.setAttribute('aGain', new BufferAttribute(f.dustGain, 1)); dg.setAttribute('aAlpha', dyn(new Float32Array(f.dustSize.length).fill(1), 1));
    dust = new Points(dg, dustMat); dust.frustumCulled = false; dust.renderOrder = 0;
    scene.add(dust, ribbons, points);
  };

  const render = (st: GlState): GlInfo => {
    const s = cur, f = fil; if (!s || !f || !points || !ribbons || !dust) return {calls: 0, points: 0, triangles: 0};
    if (st.w !== lastW || st.h !== lastH || st.dpr !== lastDpr) { renderer.setPixelRatio(st.dpr); renderer.setSize(st.w, st.h, false); lastW = st.w; lastH = st.h; lastDpr = st.dpr; }
    if (st.theme !== lastTheme) {
      const t = TOKENS[st.theme]; renderer.setClearColor(new Color(t.bg), 1); for (const m of [pointMat, ribbonMat, dustMat]) { (m.uniforms.uColor!.value as Color).set(t.mark); (m.uniforms.uHot!.value as Color).set(t.hot); m.uniforms.uInk!.value = st.theme === 'dark' ? 0 : 1; }
      // black: light adds up (denser = brighter); white: ink is laid over (denser = darker)
      for (const m of [pointMat, ribbonMat, dustMat]) { m.blending = st.theme === 'dark' ? AdditiveBlending : NormalBlending; m.needsUpdate = true; }
      // exposure: enough for the trunks to gather light where many real links run together, low enough that a single strand stays a faint thread
      // the cloud carries the picture; the strands are only a faint grain inside it, and come forward for the selected node
      ribbonMat.uniforms.uOpacity!.value = st.theme === 'dark' ? 0.7 : 0.5; ribbonMat.uniforms.uBase!.value = st.theme === 'dark' ? 0.2 : 0.16; dustMat.uniforms.uOpacity!.value = st.theme === 'dark' ? 0.62 : 0.4; lastTheme = st.theme;
    }
    syncCamera(camera, st.cam, st.w, st.h, s.layout.extent);
    const ext = s.layout.extent; shared.uDmin.value = st.cam.dist - ext; shared.uSpan.value = Math.max(1, 2 * ext);
    pointMat.uniforms.uDpr!.value = st.dpr; pointMat.uniforms.uDist!.value = st.cam.dist; pointMat.uniforms.uGlow!.value = st.halo ? 1 : 0.7; ribbonMat.uniforms.uFocal!.value = st.cam.focal; ribbonMat.uniforms.uMinPx!.value = 1; dustMat.uniforms.uDpr!.value = st.dpr; dustMat.uniforms.uFocal!.value = st.cam.focal;
    // low detail has a third of the puffs: each one carries more
    dustMat.uniforms.uOpacity!.value = (st.theme === 'dark' ? 0.72 : 0.52) * (st.halo ? 1 : 1.9);
    dustMat.uniforms.uMaxPx!.value = Math.min(st.halo ? 60 : 40, maxPoint / st.dpr);
    ribbonMat.uniforms.uFocus!.value = st.selected !== null ? 1 : 0;
    if (st.moved) (points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    if (st.filamentsMoved) { (ribbons.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true; (ribbons.geometry.getAttribute('aTangent') as BufferAttribute).needsUpdate = true; (dust.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true; }
    const sel = st.selected ?? -1, hov = st.hover ?? -1;
    if (st.style !== lastStyle) {
      (points.geometry.getAttribute('aAlpha') as BufferAttribute).copyArray(st.style.node).needsUpdate = true;
      const la = ribbons.geometry.getAttribute('aAlpha') as BufferAttribute, arr = la.array as Float32Array; for (let i = 0; i < st.style.edge.length; i += 1) arr.fill(st.style.edge[i]!, f.range[2 * i]!, f.range[2 * i]! + f.range[2 * i + 1]!); la.needsUpdate = true;
      const da = dust.geometry.getAttribute('aAlpha') as BufferAttribute, darr = da.array as Float32Array; for (let i = 0; i < st.style.edge.length; i += 1) darr.fill(st.style.edge[i]!, f.dustRange[2 * i]!, f.dustRange[2 * i]! + f.dustRange[2 * i + 1]!); da.needsUpdate = true; lastStyle = st.style;
    }
    if (sel !== lastSel || hov !== lastHover) { const m = points.geometry.getAttribute('aMark') as BufferAttribute; (m.array as Float32Array).fill(0); if (hov >= 0) m.setX(hov, 1); if (sel >= 0) m.setX(sel, 2); m.needsUpdate = true; lastSel = sel; lastHover = hov; }
    renderer.info.reset(); renderer.render(scene, camera);
    return {calls: renderer.info.render.calls, points: renderer.info.render.points, triangles: renderer.info.render.triangles};
  };
  const dispose = () => { clear(); pointMat.dispose(); ribbonMat.dispose(); dustMat.dispose(); renderer.dispose(); cur = null; fil = null; };
  return {load, render, dispose};
}
