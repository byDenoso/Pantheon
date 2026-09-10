import {PRESETS} from '../palette.mjs';

const base=PRESETS.ORIGINAL;

export const VISUAL_PRESETS=Object.freeze({
 REFERENCE_3:{...base,name:'REFERENCE_3',stars:260,glow:.96,fog:.31,focalLength:760,drift:0,pulseSpeed:1.08,filamentCurve:.15,maxLabels:24,maxVisibleNodes:110,transitionMs:420,backgroundIntensity:1},
 GALACTIC_DUST:{...base,name:'GALACTIC_DUST',stars:320,glow:1.12,fog:.24,focalLength:720,drift:.25,pulseSpeed:1.16,filamentCurve:.18,maxLabels:26,maxVisibleNodes:120,transitionMs:460,backgroundIntensity:1.04},
 FOCUS_REVIEW:{...base,name:'FOCUS_REVIEW',stars:180,nodeRadius:1.18,glow:1.08,fog:.29,focalLength:690,drift:0,pulseSpeed:.92,filamentCurve:.10,maxLabels:18,maxVisibleNodes:74,transitionMs:360,backgroundIntensity:.68},
 MOBILE_CLEAN:{...base,name:'MOBILE_CLEAN',stars:90,nodeRadius:.95,glow:.72,fog:.38,focalLength:790,drift:0,pulseSpeed:.85,filamentCurve:.09,maxLabels:9,maxVisibleNodes:58,transitionMs:320,backgroundIntensity:.48},
 PERFORMANCE:{...base,name:'PERFORMANCE',stars:110,nodeRadius:.85,glow:.48,fog:.42,focalLength:820,drift:0,pulseSpeed:.55,filamentCurve:.07,maxLabels:12,maxVisibleNodes:80,transitionMs:260,backgroundIntensity:.42},
 PRESENTATION:{...base,name:'PRESENTATION',stars:240,nodeRadius:1.08,glow:1.22,fog:.22,focalLength:700,drift:.12,pulseSpeed:1.12,filamentCurve:.20,maxLabels:30,maxVisibleNodes:100,transitionMs:520,backgroundIntensity:1.08},
 THREE_ORBITAL_CLEAN:{...base,name:'THREE_ORBITAL_CLEAN',stars:160,glow:.70,fog:.34,focalLength:820,filamentCurve:.10,nodeRadius:.95,maxLabels:24,maxVisibleNodes:125,transitionMs:420,backgroundIntensity:.72},
 THREE_DEEP_OBSERVATORY:{...base,name:'THREE_DEEP_OBSERVATORY',stars:320,glow:.95,fog:.46,focalLength:700,filamentCurve:.16,nodeRadius:1.02,maxLabels:22,maxVisibleNodes:130,transitionMs:520,backgroundIntensity:1.05},
 BABYLON_OBSERVATORY:{...base,name:'BABYLON_OBSERVATORY',stars:220,glow:.86,fog:.40,focalLength:760,filamentCurve:.14,nodeRadius:1,maxLabels:24,maxVisibleNodes:125,transitionMs:420,backgroundIntensity:.98},
 BABYLON_DEEP_SPACE:{...base,name:'BABYLON_DEEP_SPACE',stars:320,glow:1.12,fog:.50,focalLength:660,filamentCurve:.18,nodeRadius:1.08,maxLabels:20,maxVisibleNodes:120,transitionMs:520,backgroundIntensity:1.12},
 CANVAS_DEPTH_CLEAN:{...base,name:'CANVAS_DEPTH_CLEAN',glow:.68,fog:.42,focalLength:820,filamentCurve:.10,nodeRadius:.96,stars:180,maxLabels:22,maxVisibleNodes:110,transitionMs:380,backgroundIntensity:.76}
});

Object.assign(PRESETS,VISUAL_PRESETS);

export function visualPreset(name='ORIGINAL'){
 return PRESETS[name]||PRESETS.ORIGINAL;
}
