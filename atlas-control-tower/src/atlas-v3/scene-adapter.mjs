const ROOT_ID='__PRESENTATION_NEXO__';
const CLUSTER_PREFIX='__PRESENTATION_CLUSTER__:';
const CLUSTER_ORDER=['SCIENCE','ENGINEERING','INTERDOMAIN','OLYMPUS','OPERATIONS','REFERENCES','OTHER'];
const CLUSTER_META={
  SCIENCE:{label:'Ciência',summary:'Pesquisa, física, cosmologia e evidências científicas.'},
  ENGINEERING:{label:'Engenharia',summary:'Software, sistemas, arquitetura e execução técnica.'},
  INTERDOMAIN:{label:'Interdomínio',summary:'Relações e aprendizagem que atravessam domínios.'},
  OLYMPUS:{label:'Olympus',summary:'Bodybuilding, treino, nutrição e preparação competitiva.'},
  OPERATIONS:{label:'Operações',summary:'WORKs, runtime, automações e execução operacional.'},
  REFERENCES:{label:'Referências',summary:'Evidências e referências publicadas.'},
  OTHER:{label:'Outros',summary:'Entidades canônicas ainda sem domínio semântico classificado.'}
};

function clusterKey(node){
  const type=String(node?.type||'').toUpperCase();
  const domain=String(node?.domain||'').toUpperCase();
  const haystack=`${type} ${domain} ${String(node?.id||'').toUpperCase()} ${String(node?.label||'').toUpperCase()}`;
  if(type==='FILAMENT'||/INTERDOMAIN/.test(domain))return'INTERDOMAIN';
  if(type==='REFERENCE'||type==='EVIDENCE')return'REFERENCES';
  if(/OLYMPUS|BODYBUILD|PHYSIQUE|TRAIN|NUTRITION|HEALTH|FITNESS/.test(haystack))return'OLYMPUS';
  if(/OPERATIONS|OPERATION|RUNTIME|EXECUTION|AUTOMATION/.test(domain)||type==='AUTOMATION')return'OPERATIONS';
  if(/ENGINEER|SOFTWARE|TECH|DEV|CODE|INFRA|SYSTEM|DEPLOY|APP|API|PROCEDURAL/.test(haystack))return'ENGINEERING';
  if(/SCIENCE|COSMO|ASTRO|PHYSIC|CMB|GALAX|DARK_|DARK-/.test(domain)||['PROGRAM','CAMPAIGN','PROJECT','HYPOTHESIS','TEST_GROUP','CLAIM','TEST','RESULT','DATASET','ARTIFACT','PUBLICATION'].includes(type))return'SCIENCE';
  return'OTHER';
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
  const reservedIds=[ROOT_ID,...CLUSTER_ORDER.map(clusterId)];
  for(const id of reservedIds)if(sourceIds.has(id))throw new Error(`ATLAS_V3_PRESENTATION_ID_COLLISION:${id}`);

  const root={id:ROOT_ID,type:'ROOT',label:'NEXO',summary:'Mapa semântico dos domínios publicados.',status:'ACTIVE',presentationOnly:true,domain:'SYSTEM'};
  const clusters=CLUSTER_ORDER.map(key=>({
    id:clusterId(key),type:'SYSTEM',label:CLUSTER_META[key].label,summary:CLUSTER_META[key].summary,
    status:'ACTIVE',domain:key,presentationOnly:true,layoutParent:ROOT_ID
  }));
  const canonicalNodes=sourceNodes.map(source=>{
    const node={...source};
    const declaredParent=typeof source.parentId==='string'&&sourceIds.has(source.parentId)?source.parentId:null;
    node.layoutParent=declaredParent||clusterId(clusterKey(source));
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
