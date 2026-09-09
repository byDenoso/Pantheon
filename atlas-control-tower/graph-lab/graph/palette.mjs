export const PALETTE_A = {
  id: 'A',
  name: 'Observatório Premium',
  background: {top:'#05070A',bottom:'#020305',vignette:'rgba(0,0,0,0.42)',stars:'rgba(214,228,246,0.88)',nebulaA:'rgba(33,52,73,0.22)',nebulaB:'rgba(18,29,41,0.18)',grid:'rgba(120,146,175,0.08)'},
  chrome: {panel:'rgba(8,12,18,0.78)',panelBorder:'rgba(110,136,163,0.26)',panelSoft:'rgba(255,255,255,0.04)',text:'#E8EDF3',textDim:'#9AA7B5',textMuted:'#728092',accent:'#E8C982',accentSoft:'rgba(232,201,130,0.16)',success:'#8FB5A7',warning:'#D7B26D',danger:'#B98787'},
  semantic: {NEXO:'#E8C982',SCIENCE:'#8FB7D6',LEARNING:'#A8A0B8',ENGINEERING:'#8195A8',OLYMPUS:'#8FB5A7',BLACK_BOX:'#777382',DEFAULT:'#B8C4D0'},
  states: {active:'#E8C982',supported:'#9AB9D4',partial:'#B8AEC3',negative:'#8A96A3',blocked:'#8E6F6F',legacy:'#6F7983'},
  nodes: {coreFill:'#DCE6F0',edgeLight:'rgba(255,255,255,0.92)',glow:'rgba(186,203,219,0.18)',halo:'rgba(255,255,255,0.08)',fogNear:'rgba(255,255,255,0.00)',fogFar:'rgba(4,7,11,0.34)'},
  filaments: {canonical:'rgba(133,155,178,0.34)',derived:'rgba(167,160,184,0.24)',crossDomain:'rgba(143,181,167,0.22)',intraDomain:'rgba(196,206,217,0.18)',pulse:'#F2D79A',pulseHalo:'rgba(242,215,154,0.20)'},
  labels: {bg:'rgba(8,12,18,0.68)',border:'rgba(118,142,167,0.24)',text:'#E6EDF5',textDim:'#A0ADBA',selectedBg:'rgba(232,201,130,0.16)',selectedBorder:'rgba(232,201,130,0.34)'}
};

export const PALETTES={A:PALETTE_A};
export function getPalette(id='A'){return PALETTES[id]||PALETTE_A}
export function colorForNode(node,palette=PALETTE_A){
  if(node.kind==='SYSTEM'&&node.id==='NEXO')return palette.semantic.NEXO;
  if(node.id==='NEXO'||node.id==='system:NEXO')return palette.semantic.NEXO;
  if(node.domain&&palette.semantic[node.domain])return palette.semantic[node.domain];
  const system=String(node.system||'').replace(/^system:/,'');
  if(system&&palette.semantic[system])return palette.semantic[system];
  if(node.status&&palette.states[node.status])return palette.states[node.status];
  return palette.semantic.DEFAULT;
}

export const SYSTEM_COLORS={
  'system:NEXO':PALETTE_A.semantic.NEXO,
  'system:SCIENCE':PALETTE_A.semantic.SCIENCE,
  'system:LEARNING':PALETTE_A.semantic.LEARNING,
  'system:ENGINEERING':PALETTE_A.semantic.ENGINEERING,
  'system:OLYMPUS':PALETTE_A.semantic.OLYMPUS,
  'system:BLACK_BOX':PALETTE_A.semantic.BLACK_BOX
};
// Compatibility surface for the legacy renderer/tests. Palette A remains the
// authoritative semantic palette used by sigma-canvas.
export const STATUS_COLORS={supported:'#9AB9D4',partial:'#B8AEC3',negative:'#8A96A3',blocked:'#8E6F6F',active:'#9AB9D4',legacy:'#6F7983'};
const base={palette:'A',renderer:'sigma-canvas',background:'#030507',panel:'#080C12',text:PALETTE_A.chrome.text,muted:PALETTE_A.chrome.textDim,edge:'#556676',derived:'#6D6877',highlight:'#F0F3F6',nodeRadius:1,glow:.75,fog:.34,focalLength:760,drift:0,pulseSpeed:1,filamentCurve:.12,maxLabels:24,maxVisibleNodes:110,stars:120,autoOrbit:false,transitionMs:420};
export const PRESETS={
  ORIGINAL:{...base,name:'ORIGINAL'},
  CLEAN:{...base,name:'CLEAN',stars:70,glow:.62,maxLabels:20},
  DEEP_SPACE:{...base,name:'DEEP_SPACE',stars:170,glow:.82,maxLabels:22},
  HIGH_CONTRAST:{...base,name:'HIGH_CONTRAST',maxLabels:26},
  DENSE_GRAPH:{...base,name:'DENSE_GRAPH',nodeRadius:.8,glow:.52,maxLabels:14,maxVisibleNodes:240},
  MOBILE:{...base,name:'MOBILE',nodeRadius:.9,glow:.58,maxLabels:10,maxVisibleNodes:70,stars:70}
};
