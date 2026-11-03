import {useEffect, useRef} from 'react';

// Decorative background: a generated cosmic web (nodes joined to their nearest neighbours,
// galaxies scattered along the filaments). Not data. Three.js is loaded lazily so the
// cockpit's first paint does not wait for it; with reduced motion the camera stays still.
export default function CosmicWeb() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false, frameId = 0;
    const cleanup: (() => void)[] = [];
    void import('three').then(THREE => {
      const canvas = ref.current;
      if (disposed || !canvas) return;
      const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true}); } catch { return; }
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, .1, 400);
      const dot = document.createElement('canvas'); dot.width = dot.height = 64;
      const g = dot.getContext('2d')!, rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.25, 'rgba(255,255,255,.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(dot);
      let seed = 12345;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const nodes: InstanceType<typeof THREE.Vector3>[] = [];
      while (nodes.length < 150) { const p = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).multiplyScalar(88); if (p.length() < 88) nodes.push(p); }
      const edges = new Set<string>();
      nodes.forEach((p, i) => nodes.map((q, j) => [j, p.distanceTo(q)] as const).filter(e => e[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 3).forEach(([j]) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`)));
      const pos: number[] = [], dist: number[] = [], bright: number[] = [];
      const add = (v: InstanceType<typeof THREE.Vector3>) => { pos.push(v.x, v.y, v.z); dist.push(v.length()); bright.push(.35 + .65 * rnd()); };
      for (const e of edges) {
        const [i, j] = e.split('-').map(Number), a = nodes[i]!, b = nodes[j]!, n = Math.floor(a.distanceTo(b) * 6);
        for (let k = 0; k < n; k++) { const v = a.clone().lerp(b, rnd()); v.x += gauss() * .45; v.y += gauss() * .45; v.z += gauss() * .45; add(v); }
      }
      for (const p of nodes) for (let k = 0; k < 90; k++) add(p.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(1.3)));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const col = new Float32Array(pos.length); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({size: .8, map: tex, vertexColors: true, transparent: true, depthWrite: false});
      scene.add(new THREE.Points(geo, mat));
      const paint = () => {
        const dark = css('--web-mode') === 'space', star = new THREE.Color(css('--web-star')), far = new THREE.Color(css('--web-far'));
        mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending; mat.opacity = dark ? .6 : .3; mat.needsUpdate = true;
        for (let i = 0; i < dist.length; i++) { const f = Math.min(1, dist[i]! / 90), c = star.clone().lerp(far, f * f * .8), b = dark ? bright[i]! * (1 - .5 * f) : 1; col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b; }
        geo.attributes.color!.needsUpdate = true;
      };
      paint();
      const observer = new MutationObserver(paint); observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
      const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', paint);
      const resize = () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
      addEventListener('resize', resize); resize();
      let last: number | null = null, ang = .7;
      const frame = (ms: number) => {
        const dt = last === null ? 0 : Math.min(.1, (ms - last) / 1000); last = ms;
        if (!reduced && !document.hidden) ang += dt * .025;
        cam.position.set(Math.sin(ang) * 58, 14 + scrollY * .01, Math.cos(ang) * 58); cam.lookAt(0, 0, 0);
        renderer.render(scene, cam); frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);
      cleanup.push(() => { cancelAnimationFrame(frameId); observer.disconnect(); mq.removeEventListener('change', paint); removeEventListener('resize', resize); geo.dispose(); mat.dispose(); tex.dispose(); renderer.dispose(); });
    }).catch(() => { /* background is optional */ });
    return () => { disposed = true; cleanup.forEach(fn => fn()); };
  }, []);
  return <canvas ref={ref} className="ck-web" aria-hidden="true"/>;
}
