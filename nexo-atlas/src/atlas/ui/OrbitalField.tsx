import {useEffect, useRef} from 'react';
import {shouldAnimate} from './orbitalMotion.mjs';

/** A decorative field, never a representation of astronomical observations. */
export default function OrbitalField() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const app = node.closest('.atlas-app');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true, disposed = false, failed = false, creating = false, frame = 0, last = 0, elapsed = 0;
    let render: ((time: number) => void) | undefined;
    let resize: (() => void) | undefined;
    let disposeScene: (() => void) | undefined;
    const canRun = () => shouldAnimate({visible, pageVisible: !document.hidden, paused: app?.getAttribute('data-cinema-paused') === 'true', reduced: motion.matches});
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; };
    const tick = (now: number) => {
      frame = 0;
      if (!canRun() || !render) return;
      if (!last || now - last >= 1000 / 30) {
        elapsed += last ? Math.min(now - last, 80) : 0;
        last = now;
        render(elapsed / 1000);
      }
      frame = requestAnimationFrame(tick);
    };
    const create = async () => {
      if (creating || failed || disposed) return;
      creating = true;
      try {
        const THREE = await import('three');
        if (disposed || !canRun()) return;
        const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute('aria-hidden', 'true');
        node.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
        camera.position.z = 6;
        const group = new THREE.Group();
        scene.add(group);
        // Deterministic particles avoid visual changes on each render.
        let seed = 314159;
        const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
        const points = new Float32Array(180 * 3);
        for (let i = 0; i < points.length; i += 3) {
          const angle = random() * Math.PI * 2;
          const radius = 2.08 + random() * .8;
          points[i] = Math.cos(angle) * radius;
          points[i + 1] = Math.sin(angle) * radius * .55;
          points[i + 2] = (random() - .5) * .55;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
        const material = new THREE.PointsMaterial({color: 0x376cff, size: .023, transparent: true, opacity: .68, depthWrite: false, sizeAttenuation: true});
        group.add(new THREE.Points(geometry, material));
        const ringPoints = Array.from({length: 160}, (_, i) => {
          const a = i * Math.PI * 2 / 160;
          return new THREE.Vector3(Math.cos(a) * 2.42, Math.sin(a) * 1.33, 0);
        });
        const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
        const ringMaterial = new THREE.LineBasicMaterial({color: 0x376cff, transparent: true, opacity: .42, depthWrite: false});
        group.add(new THREE.LineLoop(ringGeometry, ringMaterial));
        group.rotation.z = -.23;
        resize = () => {
          const {width, height} = node.getBoundingClientRect();
          if (width < 1 || height < 1) return;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        render = time => { group.rotation.z = -.23 + time * .035; group.rotation.x = .34; renderer.render(scene, camera); };
        disposeScene = () => { geometry.dispose(); material.dispose(); ringGeometry.dispose(); ringMaterial.dispose(); renderer.dispose(); renderer.domElement.remove(); };
        resize();
        reconcile();
      } catch {
        // The illustration remains available when WebGL cannot initialize.
        failed = true;
      } finally { creating = false; }
    };
    const reconcile = () => {
      stop();
      if (!canRun()) return;
      if (!render) { void create(); return; }
      frame = requestAnimationFrame(tick);
    };
    const intersection = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries.at(-1)?.isIntersecting ?? true; reconcile();
    }, {rootMargin: '100px'}) : null;
    const size = 'ResizeObserver' in window ? new ResizeObserver(() => resize?.()) : null;
    const pause = new MutationObserver(reconcile);
    intersection?.observe(node); size?.observe(node);
    if (app) pause.observe(app, {attributes: true, attributeFilter: ['data-cinema-paused']});
    motion.addEventListener('change', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    reconcile();
    return () => {
      disposed = true; stop(); intersection?.disconnect(); size?.disconnect(); pause.disconnect();
      motion.removeEventListener('change', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
      disposeScene?.();
    };
  }, []);
  return <div className="nexo-orbital-field" ref={host} aria-hidden="true"/>;
}
