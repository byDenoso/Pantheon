import type {CSSProperties} from 'react';
import type {GraphOrbit25D as Orbit25D} from './types25d';

export function GraphOrbit25D({orbit}:{orbit:Orbit25D}){
  const style={left:`${orbit.x}%`,top:`${orbit.y}%`,width:`${orbit.width}%`,height:`${orbit.height}%`,'--orbit-z':`${orbit.z}px`,'--orbit-rotate':`${orbit.rotate}deg`} as CSSProperties;
  return <span className="graph-25d-orbit" style={style} aria-hidden="true"/>;
}
