const freeze=value=>Object.freeze(value);

export const EXPERIENCE_PRESETS=freeze({
 OPERATIONAL:freeze({
  id:'OPERATIONAL',label:'Operational',rendererId:'canvas-2d',rendererPreset:'REFERENCE_3',backgroundPreset:'dynamic-clean',theme:'dark',layoutSpacing:1.12,fitPadding:1.06,labelScale:1,maxLabels:24,maxVisibleNodes:118,motion:'low',drift:0,pulseSpeed:.9,filamentMode:'off',cockpitMode:'compact'
 }),
 EXECUTIVE_DEMO:freeze({
  id:'EXECUTIVE_DEMO',label:'Executive Demo',rendererId:'three-25d',rendererPreset:'PRESENTATION',backgroundPreset:'dynamic-galaxy',theme:'dark',layoutSpacing:1.28,fitPadding:1.14,labelScale:1.05,maxLabels:22,maxVisibleNodes:105,motion:'subtle',drift:.08,pulseSpeed:.9,filamentMode:'off',cockpitMode:'compact'
 }),
 SCIENTIFIC_REVIEW:freeze({
  id:'SCIENTIFIC_REVIEW',label:'Scientific Review',rendererId:'canvas-2d',rendererPreset:'FOCUS_REVIEW',backgroundPreset:'minimal-grid',theme:'dark',layoutSpacing:1.22,fitPadding:1.12,labelScale:1,maxLabels:34,maxVisibleNodes:165,motion:'off',drift:0,pulseSpeed:0,filamentMode:'off',cockpitMode:'detail'
 }),
 FILAMENT_DISCOVERY:freeze({
  id:'FILAMENT_DISCOVERY',label:'Filament Discovery',rendererId:'three-25d',rendererPreset:'GALACTIC_DUST',backgroundPreset:'filament-field',theme:'dark',layoutSpacing:1.24,fitPadding:1.12,labelScale:.96,maxLabels:20,maxVisibleNodes:135,motion:'subtle',drift:.05,pulseSpeed:1.05,filamentMode:'all',cockpitMode:'compact'
 }),
 PRESENTATION_3D:freeze({
  id:'PRESENTATION_3D',label:'Presentation 3D',rendererId:'three-3d',rendererPreset:'PRESENTATION',backgroundPreset:'deep-observatory',theme:'dark',layoutSpacing:1.30,fitPadding:1.15,labelScale:1.08,maxLabels:18,maxVisibleNodes:96,motion:'cinematic',drift:.12,pulseSpeed:.86,filamentMode:'off',cockpitMode:'hidden'
 }),
 MOBILE_CLEAN:freeze({
  id:'MOBILE_CLEAN',label:'Mobile Clean',rendererId:'canvas-2d',rendererPreset:'MOBILE_CLEAN',backgroundPreset:'dynamic-lightweight',theme:'dark',layoutSpacing:.68,fitPadding:.88,labelScale:.78,maxLabels:7,maxVisibleNodes:42,motion:'off',drift:0,pulseSpeed:.45,filamentMode:'off',cockpitMode:'compact'
 })
});

export const EXPERIENCE_ORDER=freeze(['OPERATIONAL','EXECUTIVE_DEMO','SCIENTIFIC_REVIEW','FILAMENT_DISCOVERY','PRESENTATION_3D','MOBILE_CLEAN']);

export function experienceById(id='OPERATIONAL'){
 return EXPERIENCE_PRESETS[id]||EXPERIENCE_PRESETS.OPERATIONAL;
}
