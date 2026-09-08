export const DEFAULT_FOCAL_LENGTH=760;

export function defaultCamera(){
 return {yaw:.22,pitch:-.18,zoom:1,panX:0,panY:0,flat:false};
}

export function rotatePoint([x,y,z],camera=defaultCamera()){
 if(camera.flat)return[x,y,0];
 const cy=Math.cos(camera.yaw||0),sy=Math.sin(camera.yaw||0);
 const cp=Math.cos(camera.pitch||0),sp=Math.sin(camera.pitch||0);
 const xx=x*cy+z*sy;
 const zz=z*cy-x*sy;
 const yy=y*cp-zz*sp;
 const depth=y*sp+zz*cp;
 return[xx,yy,depth];
}

export function projectPoint(point,camera,width,height,options={}){
 const focalLength=Number(options.focalLength||DEFAULT_FOCAL_LENGTH);
 const baseScale=Number(options.baseScale||Math.min(width/1000,height/700));
 const [xx,yy,depth]=rotatePoint(point,camera);
 const perspective=camera.flat?1:focalLength/Math.max(80,focalLength-depth);
 const scale=perspective*(camera.zoom||1)*baseScale;
 return {
  x:width/2+xx*scale+(camera.panX||0),
  y:height/2+yy*scale+(camera.panY||0),
  z:depth,
  scale
 };
}
