import {unitHash} from './layout.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function filamentControl(a,b,curve=.2,bias=1){const dx=b.x-a.x,dy=b.y-a.y;const len=Math.hypot(dx,dy)||1;const nx=-dy/len,ny=dx/len;const bend=len*curve*bias;return{cx:(a.x+b.x)/2+nx*bend,cy:(a.y+b.y)*.5+ny*bend}}
export function quadraticBezierPoint(a,cp,b,t){const u=1-t;return{x:u*u*a.x+2*u*t*cp.cx+t*t*b.x,y:u*u*a.y+2*u*t*cp.cy+t*t*b.y}}
export function pulsePhase(id,timeMs,speed=.22){const seed=unitHash(id)*2;const raw=(seed+timeMs/1000*speed)%2;return raw<=1?{t:raw,direction:1}:{t:2-raw,direction:-1}}
export function filamentKind(edge){if(edge.type&&String(edge.type).toUpperCase()==='ALTERNATIVE_FILAMENT')return String(edge.kind||'alternative-learning').toLowerCase().replaceAll('_','-');if(edge.type)return String(edge.type).toLowerCase().replaceAll('_','-');if(edge.kind)return String(edge.kind).toLowerCase().replaceAll('_','-');if(edge.authority==='canonical')return'canonical';return'derived'}
export function filamentWeight(edge){const raw=Number(String(edge?.weight??'').replace(',','.'));return Number.isFinite(raw)?clamp(raw,0,1):1}
export function filamentStatusAlpha(edge){switch(String(edge?.status||'').toUpperCase()){case'DORMANT':return .26;case'SUPERSEDED':return .14;case'CANDIDATE':case'PROVISIONAL':return .68;case'SUPPORTED_CANDIDATE':return .82;default:return 1}}
export function filamentStyle(edge,palette){
 const base=(()=>{switch(filamentKind(edge)){case'canonical':return{stroke:palette.filaments.canonical,width:1.35};case'derived':return{stroke:palette.filaments.derived,width:1.1};case'cross-domain':return{stroke:palette.filaments.crossDomain,width:1.15};case'alternative-learning':return{stroke:palette.filaments.learning||palette.chrome?.accent||palette.filaments.crossDomain,width:1.35,dash:[2,7]};case'alternative-transfer':return{stroke:palette.filaments.transfer||palette.semantic?.LEARNING||palette.filaments.derived,width:1.25,dash:[7,7]};case'alternative-validation':return{stroke:palette.filaments.validation||palette.chrome?.success||palette.filaments.crossDomain,width:1.25,dash:[3,5]};case'alternative-hypothesis':return{stroke:palette.filaments.hypothesis||palette.chrome?.warning||palette.filaments.derived,width:1.2,dash:[9,6]};case'alternative-risk':return{stroke:palette.filaments.risk||palette.chrome?.danger||palette.filaments.intraDomain,width:1.2,dash:[4,6]};default:return{stroke:palette.filaments.intraDomain,width:1}}})();
 const weight=filamentWeight(edge),statusAlpha=filamentStatusAlpha(edge);
 return{...base,width:base.width*(.72+.58*weight),opacity:(.42+.58*weight)*statusAlpha,weight,statusAlpha};
}
