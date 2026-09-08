export const SYSTEM_COLORS={
 'system:NEXO':'#E8C982','system:SCIENCE':'#8FB7D6','system:LEARNING':'#A8A0B8','system:ENGINEERING':'#8195A8','system:OLYMPUS':'#8FB5A7','system:BLACK_BOX':'#777382'
};
export const STATUS_COLORS={supported:'#9AB9D4',partial:'#B8AEC3',negative:'#8A96A3',blocked:'#8E6F6F',active:'#9AB9D4',legacy:'#6F7983'};

const base={
 background:'#030507',panel:'#080C12',text:'#E8EDF3',muted:'#9AA7B5',edge:'#556676',derived:'#6D6877',highlight:'#F0F3F6',
 nodeRadius:1,glow:.82,fog:.34,focalLength:760,drift:3.1,pulseSpeed:1,filamentCurve:.19,maxLabels:24,maxVisibleNodes:110,stars:150,
 autoOrbit:false,transitionMs:780
};

export const PRESETS={
 ORIGINAL:{...base,name:'ORIGINAL'},
 CLEAN:{...base,name:'CLEAN',stars:80,glow:.68,fog:.26,drift:2.2,maxLabels:20,filamentCurve:.16},
 DEEP_SPACE:{...base,name:'DEEP_SPACE',background:'#010304',stars:220,glow:1.02,fog:.48,drift:3.6,filamentCurve:.23},
 HIGH_CONTRAST:{...base,name:'HIGH_CONTRAST',background:'#010203',text:'#F8FAFC',muted:'#B5BEC8',glow:.96,fog:.2,maxLabels:26},
 DENSE_GRAPH:{...base,name:'DENSE_GRAPH',nodeRadius:.78,glow:.62,drift:1.8,maxLabels:16,maxVisibleNodes:240,stars:110,filamentCurve:.12},
 MOBILE:{...base,name:'MOBILE',nodeRadius:.92,glow:.72,drift:2,maxLabels:10,maxVisibleNodes:70,stars:90,filamentCurve:.16}
};
