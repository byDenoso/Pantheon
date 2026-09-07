/** Visual-only knobs. No scientific status, authority or API logic belongs here. */
export const MAP_CONFIG = Object.freeze({
 maxNodes:36, previewPerGroup:0, previewDepth:1, stars:420, orbitSpeed:.000045,
 coreRadius:49, groupRadius:26, domainRadius:18, campaignRadius:13, nodeRadius:9,
 haloAlpha:'4a', maxLabels:22, fog:.31, edgeCurve:.16, vignette:.31,
 clusterRadius:50, clusterSpread:15, transitionMs:520, ambientMaxNodes:44,
 driftAmplitude:9, spawnScale:.62
});

/** Filament rendering. Thin, low-opacity fibres with a travelling pulse:
 *  never a neon wire, never a laser. Widths are CSS pixels. */
export const FILAMENT_STYLE = Object.freeze({
 'cross-domain':{width:1.3, alpha:.30, activeAlpha:.72, pulse:2.5, glow:7.5, dash:null},
 'intra-domain':{width:0.95, alpha:.24, activeAlpha:.60, pulse:2.0, glow:5.5, dash:null},
 'intra-test':{width:0.6, alpha:.16, activeAlpha:.44, pulse:1.6, glow:4.0, dash:[3,7]},
 dimAlpha:.07, maxDeltaSeconds:.12
});

export const SYSTEM_COLORS = Object.freeze({
 'system:NEXO':'#8feeff',
 'system:SCIENCE':'#168dff',
 'system:LEARNING':'#a875ff',
 'system:AUTOMATION':'#ff4dce',
 'system:ENGINEERING':'#18e6c1',
 'system:OLYMPUS':'#62f1cd'
});

export const MAP_THEMES = Object.freeze({
 dark:{
  isLight:false,background:'#02050a',haze:'#174dff26',haze2:'#7a2cff20',stars:'#b8ecff',guide:'#367eae',node:'#2ac8ff',core:'#e4fbff',edge:'#45caff',derived:'#7187a3',text:'#ffffff',muted:'#c7d5e3',label:'#06101cf5',border:'#4781aa',highlight:'#ffffff',sphereMid:'#0d91df',sphereShadow:'#02070e',rim:'#9defff',badge:'#071522f8',badgeText:'#f5fbff',activeRing:'#ffffffff'
 },
 light:{
  isLight:true,background:'#eef5fa',haze:'#168dff10',haze2:'#925cff0d',stars:'#285e8b',guide:'#6f91ac',node:'#006bd6',core:'#004f9f',edge:'#086ac2',derived:'#61788f',text:'#0a1d31',muted:'#274763',label:'#fffffffc',border:'#49789d',highlight:'#ffffff',sphereMid:'#1978bb',sphereShadow:'#052b4c',rim:'#061d35',badge:'#fffffffe',badgeText:'#102f4d',activeRing:'#041b30ee'
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
