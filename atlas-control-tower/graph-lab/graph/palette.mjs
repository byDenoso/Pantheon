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

export const LEVEL_STYLE={
  root:{radius:26,halo:3.4,label:1,minZoomLabel:0},
  domain:{radius:15,halo:2.8,label:1,minZoomLabel:0},
  program:{radius:10,halo:2.4,label:2,minZoomLabel:0},
  campaign:{radius:6.6,halo:2,label:3,minZoomLabel:.55}
};
export function levelStyle(node){return LEVEL_STYLE[node?.hierarchyLevel]||LEVEL_STYLE.campaign}

export const TONE_COLORS={ok:PALETTE_A.chrome.success,warn:PALETTE_A.chrome.warning,blocked:PALETTE_A.chrome.danger,idle:PALETTE_A.semantic.DEFAULT};

export const PALETTES={A:PALETTE_A};
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
