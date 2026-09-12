import type {GraphNode25D} from './types25d';

export type Camera25D={
  yaw:number;
  pitch:number;
  dolly:number;
  panX:number;
  panY:number;
};

export const DEFAULT_CAMERA_25D:Camera25D={yaw:0,pitch:0,dolly:0,panX:0,panY:0};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function clampCamera25D(camera:Camera25D):Camera25D{
  return{
    yaw:clamp(camera.yaw,-34,34),
    pitch:clamp(camera.pitch,-22,22),
    dolly:clamp(camera.dolly,-360,320),
    panX:clamp(camera.panX,-520,520),
    panY:clamp(camera.panY,-360,360),
  };
}

export function orbitCamera25D(camera:Camera25D,deltaX:number,deltaY:number):Camera25D{
  return clampCamera25D({...camera,yaw:camera.yaw+deltaX*.08,pitch:camera.pitch-deltaY*.07});
}

export function panCamera25D(camera:Camera25D,deltaX:number,deltaY:number):Camera25D{
  return clampCamera25D({...camera,panX:camera.panX+deltaX,panY:camera.panY+deltaY});
}

export function dollyCamera25D(camera:Camera25D,delta:number):Camera25D{
  return clampCamera25D({...camera,dolly:camera.dolly+delta});
}

export function flyToNode(camera:Camera25D,node:Pick<GraphNode25D,'x'|'y'|'z'>):Camera25D{
  const panX=(50-node.x)*12;
  const panY=(50-node.y)*9;
  const dolly=clamp(150-node.z,-80,280);
  return clampCamera25D({...camera,panX,panY,dolly,yaw:camera.yaw*.35,pitch:camera.pitch*.35});
}
