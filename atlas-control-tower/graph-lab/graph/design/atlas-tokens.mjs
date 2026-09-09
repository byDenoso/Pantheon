const freeze=value=>Object.freeze(value);

export const DOMAIN_THEMES=freeze({
 NEXO:freeze({id:'NEXO',primary:'#ffb84d',secondary:'#38c7ff',rgb:'255,184,77',secondaryRgb:'56,199,255',label:'NEXO'}),
 SCIENCE:freeze({id:'SCIENCE',primary:'#31c8ff',secondary:'#2d6cff',rgb:'49,200,255',secondaryRgb:'45,108,255',label:'CIÊNCIA'}),
 OLYMPUS:freeze({id:'OLYMPUS',primary:'#9a6cff',secondary:'#da68d8',rgb:'154,108,255',secondaryRgb:'218,104,216',label:'OLYMPUS'}),
 ENGINEERING:freeze({id:'ENGINEERING',primary:'#2bd5c4',secondary:'#46c779',rgb:'43,213,196',secondaryRgb:'70,199,121',label:'ENGENHARIA'})
});

export const ATLAS_THEME=freeze({
 dark:freeze({
  id:'dark',
  chrome:freeze({background:'#02070f',panel:'#07111d',panelElevated:'#0a1624',border:'#18314a',text:'#edf7ff',muted:'#8ca8bf'}),
  graph:freeze({stage:'#02070f',labelBackground:'#06101b',labelText:'#ffffff',labelDim:'#aec8dc',orbit:'#57bde8',filament:'#79caef',veil:'rgba(1,6,12,.18)'})
 }),
 light:freeze({
  id:'light',
  chrome:freeze({background:'#dcebf7',panel:'#f8fcff',panelElevated:'#ffffff',border:'#8cb0cf',text:'#0b2135',muted:'#45627c'}),
  graph:freeze({stage:'#d7e8f7',labelBackground:'#051c30',labelText:'#ffffff',labelDim:'#b9defe',orbit:'#006fc9',filament:'#176d9e',veil:'rgba(5,28,48,.22)'})
 })
});

export function normalizeAtlasTheme(theme='dark'){
 return theme==='light'?ATLAS_THEME.light:ATLAS_THEME.dark;
}

export function normalizeDomain(domain='NEXO'){
 const key=String(domain||'NEXO').replace(/^lane:/,'').replace(/^system:/,'').toUpperCase();
 return DOMAIN_THEMES[key]||DOMAIN_THEMES.NEXO;
}
