export const PALETTE_A = {
  id: 'A',
  name: 'Obsidian Observatory',
  background: {
    top:'#03060B',
    bottom:'#010204',
    vignette:'rgba(0,0,0,0.52)',
    stars:'rgba(209,228,255,0.92)',
    nebulaA:'rgba(20,64,108,0.20)',
    nebulaB:'rgba(23,34,74,0.22)',
    grid:'rgba(92,136,182,0.10)'
  },
  chrome: {
    panel:'rgba(7,12,18,0.80)',
    panelBorder:'rgba(102,134,164,0.30)',
    panelSoft:'rgba(255,255,255,0.045)',
    text:'#EAF3FF',
    textDim:'#A7BED5',
    textMuted:'#70859A',
    accent:'#2EC9FF',
    accentSoft:'rgba(46,201,255,0.14)',
    success:'#69DCC1',
    warning:'#F2B45C',
    danger:'#C96A7C'
  },
  semantic: {
    NEXO:'#FFBE5C',
    SCIENCE:'#66D6FF',
    LEARNING:'#AF8DFF',
    ENGINEERING:'#5EA8FF',
    OLYMPUS:'#64E1CB',
    BLACK_BOX:'#7A8495',
    DEFAULT:'#A8BED2'
  },
  states: {
    active:'#2EC9FF',
    supported:'#82CFFF',
    partial:'#B59BFF',
    negative:'#8FA4B8',
    blocked:'#C96A7C',
    legacy:'#667789'
  },
  nodes: {
    coreFill:'#EAF4FF',
    edgeLight:'rgba(255,255,255,0.94)',
    glow:'rgba(99,185,255,0.18)',
    halo:'rgba(255,255,255,0.08)',
    fogNear:'rgba(255,255,255,0.00)',
    fogFar:'rgba(3,7,12,0.36)'
  },
  filaments: {
    canonical:'rgba(110,176,255,0.34)',
    derived:'rgba(171,145,255,0.28)',
    crossDomain:'rgba(102,225,203,0.25)',
    intraDomain:'rgba(205,225,245,0.18)',
    learning:'rgba(46,201,255,0.42)',
    transfer:'rgba(180,141,255,0.38)',
    validation:'rgba(105,220,193,0.40)',
    hypothesis:'rgba(255,190,92,0.42)',
    risk:'rgba(201,106,124,0.40)',
    pulse:'#FFC66E',
    pulseHalo:'rgba(255,198,110,0.20)'
  },
  space: {
    nebulaCore:'#102A4E',
    nebulaRim:'#08192F',
    nebulaWarm:'#3D2332',
    dust:'rgba(150,188,230,0.45)',
    coreGlow:'#FFB24D',
    coreHot:'#FFF2D7',
    orbitRing:'rgba(122,168,214,0.16)'
  },
  labels: {
    bg:'rgba(7,12,18,0.72)',
    border:'rgba(102,134,164,0.28)',
    text:'#E9F4FF',
    textDim:'#A6BCD1',
    selectedBg:'rgba(46,201,255,0.14)',
    selectedBorder:'rgba(46,201,255,0.34)'
  }
};

export const PALETTE_LIGHT={
  ...PALETTE_A,
  id:'LIGHT',
  name:'Solar Observatory',
  background:{
    top:'#F7FBFF',bottom:'#DDEBFA',vignette:'rgba(59,101,143,0.10)',
    stars:'rgba(46,92,132,0.46)',nebulaA:'rgba(80,164,228,0.16)',nebulaB:'rgba(118,151,209,0.14)',grid:'rgba(41,99,150,0.13)'
  },
  chrome:{
    ...PALETTE_A.chrome,panel:'rgba(248,252,255,0.88)',panelBorder:'rgba(57,112,165,0.30)',panelSoft:'rgba(32,86,132,0.05)',
    text:'#102033',textDim:'#314B66',textMuted:'#687F96',accent:'#0077CC',accentSoft:'rgba(0,119,204,0.12)',
    success:'#008C76',warning:'#B96A00',danger:'#B83E61'
  },
  semantic:{...PALETTE_A.semantic,NEXO:'#D78314',SCIENCE:'#087FBE',LEARNING:'#7658C9',ENGINEERING:'#2F6FB6',OLYMPUS:'#168E7D',BLACK_BOX:'#657C93',DEFAULT:'#55718B'},
  states:{active:'#0077CC',supported:'#287CB8',partial:'#7658C9',negative:'#657C93',blocked:'#B83E61',legacy:'#76889A'},
  nodes:{...PALETTE_A.nodes,coreFill:'#152A40',edgeLight:'rgba(255,255,255,0.88)',glow:'rgba(0,119,204,0.15)',halo:'rgba(27,86,133,0.08)',fogFar:'rgba(221,235,250,0.38)'},
  filaments:{canonical:'rgba(0,104,184,0.38)',derived:'rgba(111,82,190,0.30)',crossDomain:'rgba(0,137,118,0.30)',intraDomain:'rgba(69,106,138,0.24)',learning:'rgba(0,119,204,0.40)',transfer:'rgba(111,82,190,0.36)',validation:'rgba(0,140,118,0.36)',hypothesis:'rgba(201,121,22,0.38)',risk:'rgba(184,62,97,0.34)',pulse:'#C97916',pulseHalo:'rgba(201,121,22,0.18)'},
  space:{nebulaCore:'#A7D5F4',nebulaRim:'#C9DEF4',nebulaWarm:'#F2D8C2',dust:'rgba(62,105,144,0.30)',coreGlow:'#D98A21',coreHot:'#FFF5DF',orbitRing:'rgba(40,96,145,0.24)'},
  labels:{bg:'rgba(247,251,255,0.86)',border:'rgba(57,112,165,0.30)',text:'#102033',textDim:'#425E78',selectedBg:'rgba(0,119,204,0.10)',selectedBorder:'rgba(0,119,204,0.34)'}
};

export const LEVEL_STYLE={
  root:{radius:26,halo:3.4,label:1,minZoomLabel:0},
  lane:{radius:19,halo:3,label:1,minZoomLabel:0},
  domain:{radius:15,halo:2.8,label:1,minZoomLabel:0},
  group:{radius:13,halo:2.55,label:1,minZoomLabel:0},
  program:{radius:10,halo:2.4,label:2,minZoomLabel:0},
  person:{radius:10,halo:2.35,label:2,minZoomLabel:0},
  project:{radius:10,halo:2.35,label:2,minZoomLabel:0},
  campaign:{radius:6.6,halo:2,label:3,minZoomLabel:.55},
  state:{radius:6.6,halo:2,label:3,minZoomLabel:.55},
  record:{radius:5.8,halo:1.8,label:3,minZoomLabel:.65}
};
export function levelStyle(node){return LEVEL_STYLE[node?.hierarchyLevel]||LEVEL_STYLE.campaign}

export const TONE_COLORS={ok:PALETTE_A.chrome.success,warn:PALETTE_A.chrome.warning,blocked:PALETTE_A.chrome.danger,idle:PALETTE_A.semantic.DEFAULT};

export const PALETTES={A:PALETTE_A,LIGHT:PALETTE_LIGHT};
export function getPalette(id='A'){return PALETTES[id]||PALETTE_A}
export function colorForNode(node,palette=PALETTE_A){
  if(node.hue)return node.hue;
  if(node.ops?.tone==='blocked'||node.tone==='blocked')return palette.chrome.danger;
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
export const STATUS_COLORS={supported:'#82CFFF',partial:'#B59BFF',negative:'#8FA4B8',blocked:'#C96A7C',active:'#2EC9FF',legacy:'#667789'};
const base={
  palette:'A',renderer:'three-canvas',background:'#02050A',panel:'#070C12',text:PALETTE_A.chrome.text,
  muted:PALETTE_A.chrome.textDim,edge:'#4B6A89',derived:'#7562A7',highlight:'#F3F8FE',nodeRadius:1,
  glow:.78,fog:.36,focalLength:760,drift:0,pulseSpeed:1,filamentCurve:.12,maxLabels:24,
  maxVisibleNodes:110,stars:130,autoOrbit:false,transitionMs:420
};
export const PRESETS={
  ORIGINAL:{...base,name:'ORIGINAL'},
  CLEAN:{...base,name:'CLEAN',stars:76,glow:.66,maxLabels:20},
  DEEP_SPACE:{...base,name:'DEEP_SPACE',stars:180,glow:.86,maxLabels:22},
  HIGH_CONTRAST:{...base,name:'HIGH_CONTRAST',maxLabels:26},
  DENSE_GRAPH:{...base,name:'DENSE_GRAPH',nodeRadius:.8,glow:.55,maxLabels:14,maxVisibleNodes:240},
  MOBILE:{...base,name:'MOBILE',nodeRadius:.9,glow:.60,maxLabels:10,maxVisibleNodes:70,stars:76}
};