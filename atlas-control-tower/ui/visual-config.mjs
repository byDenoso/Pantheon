/** Visual-only knobs. No scientific status, authority or API logic belongs here. */
export const MAP_CONFIG = Object.freeze({
 maxNodes:120, previewPerGroup:0, previewDepth:1, stars:390, orbitSpeed:.000055,
 coreRadius:43, groupRadius:22, domainRadius:16, campaignRadius:11, nodeRadius:7,
 haloAlpha:'32', maxLabels:22, fog:.46, edgeCurve:.16, vignette:.34,
 clusterRadius:48, clusterSpread:14, transitionMs:260, ambientMaxNodes:30
});

export const SYSTEM_COLORS = Object.freeze({
 'system:NEXO':'#7fe7ff',
 'system:SCIENCE':'#168dff',
 'system:LEARNING':'#925cff',
 'system:AUTOMATION':'#ff42c8',
 'system:ENGINEERING':'#00d7b6',
 'system:OLYMPUS':'#3ce7bd'
});

export const MAP_THEMES = Object.freeze({
 dark:{
  isLight:false,background:'#01040a',haze:'#174dff24',haze2:'#6b2cff1c',stars:'#89ddff',guide:'#2269a3',node:'#20b9ff',core:'#bff2ff',edge:'#25baff',derived:'#526b91',text:'#f4f9ff',muted:'#a4bad1',label:'#050b15f5',border:'#23557c',highlight:'#f7fdff',sphereMid:'#087ed0',sphereShadow:'#020913',rim:'#6adfff',badge:'#071521f5',badgeText:'#e5f8ff',activeRing:'#ffffffdd'
 },
 light:{
  isLight:true,background:'#eef5fb',haze:'#168dff18',haze2:'#925cff10',stars:'#1d639d',guide:'#7aa9cc',node:'#086fc4',core:'#075f9f',edge:'#1976c9',derived:'#819bb4',text:'#10243a',muted:'#405b76',label:'#fffffff9',border:'#8aaac5',highlight:'#ffffff',sphereMid:'#4b92c7',sphereShadow:'#123d62',rim:'#0f3351',badge:'#fffffffa',badgeText:'#173d5f',activeRing:'#0b2741dd'
 }
});

export function themePalette(theme){return MAP_THEMES[theme]||MAP_THEMES.dark}

/** Blends two #rrggbb colours. Used for depth attenuation, never for meaning. */
export function mixHex(a,b,t){
 const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const [ar,ag,ab]=p(a),[br,bg,bb]=p(b),k=Math.max(0,Math.min(1,t));
 const m=(x,y)=>Math.round(x+(y-x)*k).toString(16).padStart(2,'0');
 return '#'+m(ar,br)+m(ag,bg)+m(ab,bb);
}
