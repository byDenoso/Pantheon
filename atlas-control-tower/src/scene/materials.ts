import { AdditiveBlending, MeshBasicMaterial } from 'three';

// Plain MeshBasicMaterial (flat, unlit, vertex-colored) instead of a WebGPU/TSL Node
// Material. The TSL node-material path (MeshBasicNodeMaterial from 'three/webgpu' +
// vertexColor()/time from 'three/tsl') crashed at runtime under the WebGL2 backend
// that is the contractual default renderer here (repeated "Cannot read properties of
// undefined (reading 'replace')" from inside three's node system, confirmed via a
// real browser smoke test -- not something WebGPU-opt-in users would ever hit, but a
// hard crash for every default WebGL2 user, i.e. everyone). Node materials are built
// for WebGPURenderer; their WebGL2 fallback path is not reliable enough here to keep
// as the default. Plain materials keep the same flat/unlit/vertex-colored look the
// design contract already calls for, and are universally supported by both backends.
// vertexColors is intentionally left at its default (false) on all three materials
// below. This was the actual, confirmed root cause of the "nodes/filaments render
// solid black" defect: material.vertexColors=true makes three.js's WebGLProgram
// compile a per-VERTEX `attribute vec3 color` into the vertex shader (gated purely
// on the material flag, independent of instancing -- see WebGLProgram.js's
// `parameters.vertexColors ? '#define USE_COLOR' : ''` for the vertex stage) and
// multiply vColor by it *before* the separate per-INSTANCE `instanceColor`
// multiply runs. None of our geometries (sphereGeometry/cylinderGeometry) ever
// define a `color` attribute -- we only ever set colors via setColorAt/
// instanceColor -- so that phantom vertex attribute is never bound and reads
// WebGL's default (0,0,0,1), zeroing vColor to black regardless of what
// instanceColor actually holds. Confirmed live: forcing a hardcoded, unmistakable
// green instanceColor on every instance still rendered solid black until
// vertexColors was removed here. instance-level coloring (setColorAt) does not
// need material.vertexColors at all -- USE_INSTANCING_COLOR is derived solely
// from `object.instanceColor !== null`, and the fragment-side USE_COLOR define
// already has its own `|| instancingColor` clause, so per-instance color keeps
// working correctly once this phantom per-vertex path is removed.
export function createNodeMaterial() {
  return new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.96, depthWrite: true });
}

export function createNodeAuraMaterial() {
  return new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.16, depthWrite: false, depthTest: true, blending: AdditiveBlending });
}

export function createFilamentMaterial() {
  return new MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.52, depthWrite: false });
}
