/** Visual-only knobs. No scientific status, authority or API logic belongs here. */
export const MAP_CONFIG = Object.freeze({
 maxNodes:120, previewPerGroup:0, previewDepth:1, stars:390, orbitSpeed:.000055,
 coreRadius:45, groupRadius:23, domainRadius:17, campaignRadius:12, nodeRadius:8,
 haloAlpha:'3d', maxLabels:22, fog:.38, edgeCurve:.16, vignette:.28,
 clusterRadius:50, clusterSpread:15, transitionMs:240, ambientMaxNodes:30
});

export const SYSTEM_COLORS = Object.freeze({
 'system:NEXO':'#8deaff',
 'system:SCIENCE':'#168dff',
 'system:LEARNING':'#a36cff',
 'system:AUTOMATION':'#ff4dce',
 'system:ENGINEERING':'#16e1bf',
 'system:OLYMPUS':'#55ebc6'
});

export const MAP_THEMES = Object.freeze({
 dark:{
  isLight:false,background:'#01040a',haze:'#174dff24',haze2:'#6b2cff1c',stars:'#a7e7ff',guide:'#2e77ad',node:'#27c0ff',core:'#d6f8ff',edge:'#39c4ff',derived:'#6e86a6',text:'#ffffff',muted:'#c1d2e3',label:'#07111dfb',border:'#3a719b',highlight:'#ffffff',sphereMid:'#0b88d9',sphereShadow:'#020811',rim:'#8ceaff',badge:'#081726fb',badgeText:'#f1fbff',activeRing:'#ffffffff'
 },
 light:{
  isLight:true,background:'#f4f8fc',haze:'#168dff0f',haze2:'#925cff0b',stars:'#316b98',guide:'#769bb8',node:'#006bd6',core:'#005aaf',edge:'#0b6fc7',derived:'#6f8296',text:'#0a1d31',muted:'#304d69',label:'#fffffffE',border:'#5e84a5',highlight:'#ffffff',sphereMid:'#267ebc',sphereShadow:'#082f52',rim:'#072b49',badge:'#fffffffe',badgeText:'#102f4d',activeRing:'#041b30ee'
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
