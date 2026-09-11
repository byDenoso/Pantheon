/** Graph Contract V1 — the presentation layer knows the contract, never the physical store. */
export const CONTRACT_VERSION = 'v1';

/** Where a payload came from. Drive is the canonical Atlas projection source. */
export const SOURCES = Object.freeze({LEGACY:'legacy', V1:'v1', DRIVE:'drive'});
export const FRESHNESS = Object.freeze({LIVE:'LIVE', STAGING:'STAGING', SNAPSHOT:'SNAPSHOT', STALE:'STALE', FALLBACK:'FALLBACK'});
export const CACHE_STATES = Object.freeze(['HIT', 'MISS', 'STALE', 'REVALIDATED']);

export const EMPTY_GRAPH = Object.freeze({
 focus:'', nodes:[], edges:[], total:0, hasMore:false, truncated:false, depth:1,
 fingerprint:'', sourceVersion:'', source:SOURCES.DRIVE, freshness:FRESHNESS.SNAPSHOT,
 cache:'', issues:[]
});

const str=(v,fallback='')=>(v==null?fallback:String(v));
const arr=v=>(Array.isArray(v)?v:[]);
const sourceOf=value=>Object.values(SOURCES).includes(value)?value:SOURCES.DRIVE;

export function normalizeGraph(payload,{focus=''}={}){
 const p=payload&&typeof payload==='object'?payload:{};
 const nodes=arr(p.nodes);const edges=arr(p.edges);const ids=new Set(nodes.map(n=>n.id));
 const known=new Set(['focus','nodes','edges','total','hasMore','truncated','depth','fingerprint','sourceVersion','source','freshness','cache','issues','domainLinks']);
 const extra=Object.fromEntries(Object.entries(p).filter(([k])=>!known.has(k)));
 return {
  focus:str(p.focus,focus),nodes,
  edges:edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),
  total:Number.isFinite(p.total)?p.total:nodes.length,
  hasMore:!!p.hasMore,truncated:!!p.truncated,depth:Number(p.depth)||1,
  fingerprint:str(p.fingerprint),sourceVersion:str(p.sourceVersion),source:sourceOf(p.source),
  freshness:Object.values(FRESHNESS).includes(p.freshness)?p.freshness:FRESHNESS.SNAPSHOT,
  cache:CACHE_STATES.includes(p.cache)?p.cache:'',issues:arr(p.issues),
  domainLinks:arr(p.domainLinks).map(l=>({a:str(l?.a),b:str(l?.b),tests:Number(l?.tests)||0})).filter(l=>l.a&&l.b&&l.a!==l.b&&l.tests>0),
  extra
 };
}

export function contractIssues(payload){
 const p=payload&&typeof payload==='object'?payload:{};
 const missing=['nodes','edges'].filter(k=>!Array.isArray(p[k]));
 const soft=['total','fingerprint','sourceVersion','depth'].filter(k=>p[k]==null);
 const badEdges=arr(p.edges).filter(e=>!e||!e.source||!e.target).length;
 return [...missing.map(k=>({level:'ERROR',field:k,reason:'MISSING_REQUIRED_ARRAY'})),...soft.map(k=>({level:'WARN',field:k,reason:'MISSING_OPTIONAL_FIELD'})),...(badEdges?[{level:'WARN',field:'edges',reason:'EDGE_WITHOUT_ENDPOINTS',count:badEdges}]:[])];
}

export function cacheKey({fingerprint='',focus='',depth=1,filters={},source=SOURCES.DRIVE}={}){
 const f=Object.entries(filters).filter(([,v])=>v!==''&&v!=null).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join(',');
 return `graph:${CONTRACT_VERSION}:${source}:${fingerprint||'nofp'}:${focus||'root'}:${depth}:${f||'none'}`;
}

export function provenanceLabel({source,freshness}={}){
 const base=source===SOURCES.DRIVE?'DRIVE · PROJEÇÃO CANÔNICA':source===SOURCES.V1?'PROJEÇÃO CANÔNICA':'SNAPSHOT LEGADO';
 if(freshness===FRESHNESS.FALLBACK)return 'FALLBACK · '+base;
 if(freshness===FRESHNESS.STALE)return 'STALE · '+base;
 if(freshness===FRESHNESS.STAGING)return 'STAGING · '+base;
 if(freshness===FRESHNESS.LIVE)return 'LIVE · '+base;
 return base;
}
