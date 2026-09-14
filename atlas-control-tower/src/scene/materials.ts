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
export function createNodeMaterial() {
  return new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, depthWrite: true });
}

export function createNodeAuraMaterial() {
  return new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, depthTest: true, blending: AdditiveBlending });
}

export function createFilamentMaterial() {
  return new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.52, depthWrite: false });
}
