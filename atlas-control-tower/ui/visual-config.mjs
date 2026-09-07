/** Visual-only knobs. No scientific status, authority or API logic belongs here. */
export const MAP_CONFIG = Object.freeze({
 maxNodes:120, previewPerGroup:5, previewDepth:1, stars:340, orbitSpeed:.00004,
 coreRadius:38, groupRadius:18, nodeRadius:6, haloAlpha:'22', maxLabels:24,
 fog:.68,
 edgeCurve:.16,
 vignette:.46,
 clusterRadius:52, clusterSpread:8
});
export const SYSTEM_COLORS = Object.freeze({
 'system:NEXO':'#7fe7ff',
 'system:SCIENCE':'#2bb3ff',
 'system:LEARNING':'#9b6dff',
 'system:AUTOMATION':'#ff4fd8',
 'system:ENGINEERING':'#20e6c7',
 'system:OLYMPUS':'#63ffd1'
});
export const MAP_THEMES = Object.freeze({
 dark:{background:'#01040a',haze:'#225bff20',stars:'#77d4ff',guide:'#236ca8',node:'#20b9ff',core:'#b7ecff',edge:'#1da8ff',derived:'#4f6387',text:'#eef7ff',muted:'#8ea8c2',label:'#030914ed',border:'#155083',highlight:'#f0fbff',sphereMid:'#087ed0',sphereShadow:'#020913',rim:'#49d5ff',badge:'#06111fed',badgeText:'#d9f5ff'},
 light:{background:'#f8fcff',haze:'#62b7ff18',stars:'#2f76b7',guide:'#78a7cf',node:'#1769aa',core:'#075f9f',edge:'#4c83b2',derived:'#90a8c0',text:'#10243a',muted:'#4c6077',label:'#fffffff2',border:'#c8d9e8',highlight:'#ffffff',sphereMid:'#6d9fc7',sphereShadow:'#1b527f',rim:'#d8f3ff',badge:'#f8fcffed',badgeText:'#154e7c'}
});
export function themePalette(theme){return MAP_THEMES[theme]||MAP_THEMES.dark}

/** Blends two #rrggbb colours. Used for depth attenuation, never for meaning. */
export function mixHex(a,b,t){
 const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const [ar,ag,ab]=p(a),[br,bg,bb]=p(b),k=Math.max(0,Math.min(1,t));
 const m=(x,y)=>Math.round(x+(y-x)*k).toString(16).padStart(2,'0');
 return '#'+m(ar,br)+m(ag,bg)+m(ab,bb);
}
