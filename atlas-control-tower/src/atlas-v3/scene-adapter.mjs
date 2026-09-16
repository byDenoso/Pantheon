const ROOT_ID='__PRESENTATION_NEXO__';
const CLUSTER_PREFIX='__PRESENTATION_CLUSTER__:';
const PRODUCT_KEYS=['SCIENCE','ENGINEERING','OLYMPUS'];
const PRODUCT_META={
  SCIENCE:{label:'Ciência',summary:'Pesquisa, física, cosmologia e evidências.'},
  ENGINEERING:{label:'Engenharia',summary:'Software, sistemas, arquitetura e execução técnica.'},
  OLYMPUS:{label:'Olympus',summary:'Bodybuilding, treino, nutrição e preparação competitiva.'}
};

function productKey(node){
  const type=String(node?.type||'').toUpperCase();
  const domain=String(node?.domain||'').toUpperCase();
  const haystack=`${type} ${domain} ${String(node?.id||'').toUpperCase()} ${String(node?.label||'').toUpperCase()}`;
  if(/OLYMPUS|BODYBUILD|PHYSIQUE|TRAIN|NUTRITION|HEALTH|FITNESS/.test(haystack))return'OLYMPUS';
  if(/ENGINEER|SOFTWARE|TECH|DEV|CODE|INFRA|SYSTEM|OPERAT|DEPLOY|RUNTIME|APP|API/.test(haystack))return'ENGINEERING';
  return'SCIENCE';
}
function clusterId(key){return`${CLUSTER_PREFIX}${key}`}
function isNonAuthoritativeGithub(node){
  const source=`${String(node?.source||'')} ${String(node?.sourceType||'')} ${String(node?.origin||'')}`.toLowerCase();
  const authority=String(node?.authority||node?.authoritative||'').toLowerCase();
  return source.includes('github')&&(['false','no','non-authoritative','non_authoritative','nonauthoritative'].includes(authority)||authority.includes('non-author'));
}

export function buildAtlasV3Scene(snapshot){
  const rawNodes=Array.isArray(snapshot?.graph?.root?.nodes)?snapshot.graph.root.nodes:[];
  const sourceNodes=rawNodes.filter(node=>!isNonAuthoritativeGithub(node));
  const sourceIds=new Set(sourceNodes.map(node=>String(node.id)));
  const rawEdges=Array.isArray(snapshot?.graph?.root?.edges)?snapshot.graph.root.edges:[];
  const sourceEdges=rawEdges.filter(edge=>sourceIds.has(String(edge.source))&&sourceIds.has(String(edge.target)));
  const reservedIds=[ROOT_ID,...PRODUCT_KEYS.map(clusterId)];
  for(const id of reservedIds)if(sourceIds.has(id))throw new Error(`ATLAS_V3_PRESENTATION_ID_COLLISION:${id}`);

  const root={id:ROOT_ID,type:'ROOT',label:'NEXO',summary:'Mapa dos três domínios de produto.',status:'ACTIVE',presentationOnly:true,domain:'SYSTEM'};
  const clusters=PRODUCT_KEYS.map(key=>({
    id:clusterId(key),type:'SYSTEM',label:PRODUCT_META[key].label,summary:PRODUCT_META[key].summary,
    status:'ACTIVE',domain:key,presentationOnly:true,layoutParent:ROOT_ID
  }));
  const canonicalNodes=sourceNodes.map(source=>{
    const node={...source};
    const declaredParent=typeof source.parentId==='string'&&sourceIds.has(source.parentId)?source.parentId:null;
    node.layoutParent=declaredParent||clusterId(productKey(source));
    return node;
  });
  const nodes=[root,...clusters,...canonicalNodes];
  return{
    graph:{nodes,edges:sourceEdges.map(edge=>({...edge})),total:nodes.length,visualTotal:nodes.length,truncated:false,hasMore:false},
    focusId:ROOT_ID,
    canonicalIds:new Set(canonicalNodes.map(node=>String(node.id))),
    presentationIds:new Set(reservedIds)
  };
}

export{ROOT_ID as ATLAS_V3_PRESENTATION_ROOT,CLUSTER_PREFIX as ATLAS_V3_CLUSTER_PREFIX};
