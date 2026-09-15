const EPS=1e-9;

function finite(value,fallback=0){return Number.isFinite(value)?Number(value):fallback}
function vec(value,fallback=[0,0,0]){
  return [finite(value?.[0],fallback[0]),finite(value?.[1],fallback[1]),finite(value?.[2],fallback[2])];
}
function add(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function scale(a,k){return [a[0]*k,a[1]*k,a[2]*k]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function length(a){return Math.hypot(a[0],a[1],a[2])}
function normalize(a,fallback=[0,1,0]){
  const n=length(a);
  return n>EPS?scale(a,1/n):[...fallback];
}
function rotateAroundAxis(vector,axis,angle){
  const k=normalize(axis,[1,0,0]);
  const c=Math.cos(angle);const s=Math.sin(angle);
  return add(add(scale(vector,c),scale(cross(k,vector),s)),scale(k,dot(k,vector)*(1-c)));
}
function safeRight(forward,up){
  let right=cross(forward,up);
  if(length(right)<=EPS){
    const fallback=Math.abs(forward[1])<0.92?[0,1,0]:[1,0,0];
    right=cross(forward,fallback);
  }
  return normalize(right,[1,0,0]);
}
function orthonormalUp(offset,up){
  const forward=normalize(scale(offset,-1),[0,0,-1]);
  const right=safeRight(forward,up);
  return normalize(cross(right,forward),[0,1,0]);
}

/**
 * Rotate the camera itself around a target, preserving radius and transporting
 * its local up vector through both poles. No spherical polar clamp is used.
 */
export function freeOrbitPose({position=[0,0,10],up=[0,1,0],target=[0,0,0],deltaYaw=0,deltaPitch=0}={}){
  const safeTarget=vec(target,[0,0,0]);
  let offset=sub(vec(position,[0,0,10]),safeTarget);
  const distance=Math.max(EPS,length(offset));
  let transportedUp=normalize(vec(up,[0,1,0]),[0,1,0]);

  const yaw=finite(deltaYaw,0);const pitch=finite(deltaPitch,0);
  if(Math.abs(yaw)>EPS){
    offset=rotateAroundAxis(offset,transportedUp,yaw);
  }

  if(Math.abs(pitch)>EPS){
    const forward=normalize(scale(offset,-1),[0,0,-1]);
    const right=safeRight(forward,transportedUp);
    offset=rotateAroundAxis(offset,right,pitch);
    transportedUp=rotateAroundAxis(transportedUp,right,pitch);
  }

  offset=scale(normalize(offset,[0,0,1]),distance);
  transportedUp=orthonormalUp(offset,transportedUp);
  return {position:add(safeTarget,offset),up:transportedUp,target:safeTarget};
}

export function pointerOrbitDelta({dx=0,dy=0,width=1,height=1,sensitivity=1}={}){
  const w=Math.max(1,finite(width,1));const h=Math.max(1,finite(height,1));
  const gain=Math.max(0,finite(sensitivity,1));
  return {
    deltaYaw:-(finite(dx,0)/w)*Math.PI*2*gain,
    deltaPitch:-(finite(dy,0)/h)*Math.PI*2*gain,
  };
}
