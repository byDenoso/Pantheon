export type GraphTheme={background:number;grid:number;edge:number;label:number;focus:number;node:number;domain:number;test:number;claim:number;evidence:number;star:number};

const FALLBACK:GraphTheme={background:0x041019,grid:0x173346,edge:0x3b789f,label:0xeefaff,focus:0x55dfff,node:0x6aa8ff,domain:0x4fb8ff,test:0xffc65d,claim:0xd782ff,evidence:0x55e7a4,star:0xb8e9ff};

function colorToken(styles:CSSStyleDeclaration,name:string,fallback:number){
  const raw=styles.getPropertyValue(name).trim();
  if(!raw.startsWith('#'))return fallback;
  const hex=raw.slice(1);
  const expanded=hex.length===3?hex.split('').map(char=>char+char).join(''):hex.slice(0,6);
  const parsed=Number.parseInt(expanded,16);
  return Number.isFinite(parsed)?parsed:fallback;
}

export function readGraphTheme():GraphTheme{
  if(typeof document==='undefined')return FALLBACK;
  const styles=getComputedStyle(document.documentElement);
  return {
    background:colorToken(styles,'--graph-background',FALLBACK.background),
    grid:colorToken(styles,'--graph-grid',FALLBACK.grid),
    edge:colorToken(styles,'--graph-edge',FALLBACK.edge),
    label:colorToken(styles,'--graph-label',FALLBACK.label),
    focus:colorToken(styles,'--graph-focus',FALLBACK.focus),
    node:colorToken(styles,'--graph-node',FALLBACK.node),
    domain:colorToken(styles,'--graph-node-domain',FALLBACK.domain),
    test:colorToken(styles,'--graph-node-test',FALLBACK.test),
    claim:colorToken(styles,'--graph-node-claim',FALLBACK.claim),
    evidence:colorToken(styles,'--graph-node-evidence',FALLBACK.evidence),
    star:colorToken(styles,'--graph-label',FALLBACK.star)
  };
}

export function graphNodeColor(type:string,theme:GraphTheme){
  const value=type.toUpperCase();
  if(value==='ROOT'||value==='SYSTEM')return theme.focus;
  if(value==='DOMAIN')return theme.domain;
  if(value==='TEST'||value==='RUN')return theme.test;
  if(value==='CLAIM'||value==='HYPOTHESIS')return theme.claim;
  if(value==='RESULT'||value==='EVIDENCE')return theme.evidence;
  return theme.node;
}
