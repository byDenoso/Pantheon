import {unitHash} from './layout.mjs';

export function filamentControl(a,b,curve=.2,bias=1){const dx=b.x-a.x,dy=b.y-a.y;const len=Math.hypot(dx,dy)||1;const nx=-dy/len,ny=dx/len;const bend=len*curve*bias;return{cx:(a.x+b.x)/2+nx*bend,cy:(a.y+b.y)/2+ny*bend}}
export function quadraticBezierPoint(a,cp,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*cp.cx+t*t*b.x,y:u*u*a.y+2*u*t*cp.cy+t*t*b.y}}
export function pulsePhase(id,timeMs,speed=.22){const seed=unitHash(id)*2;const raw=(seed+timeMs/1000*speed)%2;return raw<=1?{t:raw,direction:1}:{t:2-raw,direction:-1}}
export function filamentKind(edge){if(edge.type)return String(edge.type).toLowerCase().replace('_','-');if(edge.kind)return String(edge.kind).toLowerCase().replace('_','-');if(edge.authority==='canonical')return'canonical';return'derived'}
export function filamentStyle(edge,palette){switch(filamentKind(edge)){case'canonical':return{stroke:palette.filaments.canonical,width:1.35};case'derived':return{stroke:palette.filaments.derived,width:1.1};case'cross-domain':return{stroke:palette.filaments.crossDomain,width:1.15};default:return{stroke:palette.filaments.intraDomain,width:1}}}
