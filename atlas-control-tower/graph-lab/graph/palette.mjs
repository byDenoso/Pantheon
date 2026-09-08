export const SYSTEM_COLORS={
 'system:NEXO':'#b9e9ff','system:SCIENCE':'#72d6ff','system:LEARNING':'#b9a0ff','system:ENGINEERING':'#82b5e8','system:OLYMPUS':'#72dec8','system:BLACK_BOX':'#9a8bd0'
};
export const STATUS_COLORS={supported:'#6fdec3',partial:'#e9c47b',negative:'#ef8799',blocked:'#ff6b82',active:'#78cfff',legacy:'#76849c'};

const base={
 background:'#020711',panel:'#07101d',text:'#eef6ff',muted:'#8ca0b9',edge:'#53789d',derived:'#6d668d',highlight:'#f6fbff',
 nodeRadius:1,glow:1,fog:.38,focalLength:760,drift:3.1,pulseSpeed:1,filamentCurve:.19,maxLabels:24,maxVisibleNodes:110,stars:150,
 autoOrbit:false,transitionMs:780
};

export const PRESETS={
 ORIGINAL:{...base,name:'ORIGINAL'},
 CLEAN:{...base,name:'CLEAN',stars:80,glow:.78,fog:.28,drift:2.2,maxLabels:20,filamentCurve:.16},
 DEEP_SPACE:{...base,name:'DEEP_SPACE',background:'#01040a',stars:220,glow:1.28,fog:.52,drift:3.6,filamentCurve:.23},
 HIGH_CONTRAST:{...base,name:'HIGH_CONTRAST',background:'#00050d',text:'#ffffff',muted:'#b8c7d9',glow:1.15,fog:.22,maxLabels:26},
 DENSE_GRAPH:{...base,name:'DENSE_GRAPH',nodeRadius:.78,glow:.72,drift:1.8,maxLabels:16,maxVisibleNodes:240,stars:110,filamentCurve:.12},
 MOBILE:{...base,name:'MOBILE',nodeRadius:.92,glow:.9,drift:2,maxLabels:10,maxVisibleNodes:70,stars:90,filamentCurve:.16}
};
