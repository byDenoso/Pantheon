/** Visual-only knobs. No scientific status, authority or API logic belongs here. */
export const MAP_CONFIG = Object.freeze({
 maxNodes:120, previewPerGroup:9, stars:260, orbitSpeed:.00004,
 coreRadius:38, groupRadius:18, nodeRadius:5, haloAlpha:'16', maxLabels:20,
 // Atmosphere: how far a distant node fades toward the background (0 = flat, 1 = vanishes).
 fog:.62,
 // Bow of a relation, as a fraction of its own length. Curvature is decorative.
 edgeCurve:.16,
 // Periphery darkening that pushes the eye to the focus.
 vignette:.38,
 // Satellites sit closer to their parent so a cluster reads as one system.
 clusterRadius:34, clusterSpread:10
});
export const MAP_THEMES = Object.freeze({
 dark:{background:'#050816',haze:'#1f8fff18',stars:'#75c8ff',guide:'#2f78b8',node:'#3ea6ff',core:'#8fd8ff',edge:'#2f86d9',derived:'#526f92',text:'#eaf4ff',muted:'#9fb4cc',label:'#07111fee',border:'#1f4266',highlight:'#dff4ff',sphereMid:'#246da8',sphereShadow:'#091426',rim:'#72c9ff',badge:'#0b1d33ed',badgeText:'#c9ecff'},
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
