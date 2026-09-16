export type Vec3=[number,number,number];
export type FreeOrbitPose={position:Vec3;up:Vec3;target:Vec3};
export function freeOrbitPose(input?:Partial<FreeOrbitPose>&{deltaYaw?:number;deltaPitch?:number}):FreeOrbitPose;
export function pointerOrbitDelta(input?:{dx?:number;dy?:number;width?:number;height?:number;sensitivity?:number}):{deltaYaw:number;deltaPitch:number};
