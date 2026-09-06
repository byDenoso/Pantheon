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
 dark:{background:'#080f1d',haze:'#25477224',stars:'#a5bddb',guide:'#597cab',node:'#729ccf',core:'#a3c6ee',edge:'#7599c5',derived:'#536f99',text:'#e4edf9',muted:'#9aacc5',label:'#0b1626ed',border:'#365275',highlight:'#e7f1ff',sphereMid:'#416591',sphereShadow:'#101e35',rim:'#cfe4ff',badge:'#12233bee',badgeText:'#a8c6e8'},
 light:{background:'#fbfdff',haze:'#84aadd18',stars:'#5176a5',guide:'#91b2dc',node:'#406faa',core:'#386eaf',edge:'#557eaf',derived:'#90a8c8',text:'#173451',muted:'#496685',label:'#fffffff0',border:'#c5d5e9',highlight:'#ffffff',sphereMid:'#769ac5',sphereShadow:'#244a7a',rim:'#ffffff',badge:'#ffffffee',badgeText:'#2c5687'}
});
export function themePalette(theme){return MAP_THEMES[theme]||MAP_THEMES.dark}

/** Blends two #rrggbb colours. Used for depth attenuation, never for meaning. */
export function mixHex(a,b,t){
 const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const [ar,ag,ab]=p(a),[br,bg,bb]=p(b),k=Math.max(0,Math.min(1,t));
 const m=(x,y)=>Math.round(x+(y-x)*k).toString(16).padStart(2,'0');
 return '#'+m(ar,br)+m(ag,bg)+m(ab,bb);
}
