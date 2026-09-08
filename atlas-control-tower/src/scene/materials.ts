import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vertexColor, time, float } from 'three/tsl';

export function createNodeMaterial() {
  const material = new MeshBasicNodeMaterial({ transparent:true, vertexColors:true });
  material.colorNode = vertexColor();
  material.opacity = 0.96;
  material.depthWrite = true;
  return material;
}

export function createFilamentMaterial() {
  const material = new MeshBasicNodeMaterial({ transparent:true, vertexColors:true });
  const pulse = float(0.82).add(time.mul(1.35).sin().mul(0.18));
  material.colorNode = vertexColor().mul(pulse);
  material.opacity = 0.52;
  material.depthWrite = false;
  return material;
}
