import {unitHash} from './layout.mjs';

export function orbitalDrift(id,timeMs,amplitude=3){
 const seed=unitHash(id);
 const t=timeMs/1000;
 const a=seed*Math.PI*2;
 const f=.16+seed*.08;
 return [
  Math.sin(t*f+a)*amplitude,
  Math.cos(t*f*.83+a*1.7)*amplitude*.72,
  Math.sin(t*f*.61+a*2.3)*amplitude*.58
 ];
}
