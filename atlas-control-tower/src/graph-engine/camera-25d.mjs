const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const CAMERA25D_PRESETS=Object.freeze({
  flat:Object.freeze({depth:.22,yaw:0,pitch:0}),
  balanced:Object.freeze({depth:1,yaw:0,pitch:0}),
  deep:Object.freeze({depth:1.55,yaw:0,pitch:0}),
});

export function depthScale25d(z,camera={}){
  const depth=Number.isFinite(Number(camera.depth))?Number(camera.depth):1;
  return clamp(1+Number(z||0)*.08*depth,.7,1.28);
}

export function depthOpacity25d(z,camera={}){
  const depth=Number.isFinite(Number(camera.depth))?Number(camera.depth):1;
  return clamp(.72+Number(z||0)*.14*depth,.24,1);
}

export function projectPoint25d(point={},camera={}){
  const z=Number(point.z||0);
  const yaw=Number(camera.yaw||0)*Math.PI/180;
  const pitch=Number(camera.pitch||0)*Math.PI/180;
  const depth=Number.isFinite(Number(camera.depth))?Number(camera.depth):1;
  return {
    x:Number(point.x||0)+z*Math.sin(yaw)*44*depth,
    y:Number(point.y||0)-z*Math.sin(pitch)*38*depth,
    z,
    depthScale:depthScale25d(z,{depth}),
    depthAlpha:depthOpacity25d(z,{depth}),
  };
}

export function worldToScreen25d(point={},camera={}){
  const projected=projectPoint25d(point,camera);
  const zoom=Number.isFinite(Number(camera.zoom))?Number(camera.zoom):1;
  return {...projected,x:projected.x*zoom+Number(camera.x||0),y:projected.y*zoom+Number(camera.y||0)};
}

export function screenToWorld25d(point={},camera={}){
  const zoom=Math.max(.0001,Number.isFinite(Number(camera.zoom))?Number(camera.zoom):1);
  return {x:(Number(point.x||0)-Number(camera.x||0))/zoom,y:(Number(point.y||0)-Number(camera.y||0))/zoom};
}

export function perspectiveDepth25d(preset='balanced'){
  return CAMERA25D_PRESETS[preset]?.depth??CAMERA25D_PRESETS.balanced.depth;
}