const DERIVED='DERIVED_NOT_EVIDENCE';
const SYSTEMS=[
 ['SCIENCE','Ciência'],
 ['ENGINEERING','Engineering'],
 ['OLYMPUS','Olympus'],
 ['AUTOMATION','Black Box'],
 ['LEARNING','Learning']
];
const FILTER_KEYS=['type','domain','authority','status','since','query'];

export function isFastRootQuery(query={}){
 const focus=query.focus||'system:NEXO';
 const mode=query.mode||'children';
 const depth=Number(query.depth||1);
 const offset=Number(query.offset||0);
 if(focus!=='system:NEXO'||mode!=='children'||depth!==1||offset!==0)return false;
 return FILTER_KEYS.every(key=>query[key]===undefined||query[key]===null||query[key]==='');
}

export function systemRootGraph(){
 const root={
  id:'system:NEXO',type:'SYSTEM',label:'NEXO',
  summary:'Unified Cognitive Infrastructure · projeção read-only do Neon.',
  authority:DERIVED,status:'active'
 };
 const children=SYSTEMS.map(([id,label])=>({id:`system:${id}`,type:'SYSTEM',label,authority:DERIVED,status:'active'}));
 return{
  focus:'system:NEXO',
  nodes:[root,...children],
  edges:children.map(node=>({
   id:`system:NEXO:CONTAINS:${node.id}`,source:'system:NEXO',target:node.id,type:'CONTAINS',authority:DERIVED
  })),
  total:1+children.length,hasMore:false,truncated:false,depth:1,
  fingerprint:'',sourceVersion:'',source:'v1',freshness:'LIVE',cache:'MISS',issues:[]
 };
}
