const ROOT_ID='__PRESENTATION_NEXO__';
const CLUSTER_PREFIX='__PRESENTATION_CLUSTER__:';
const CLUSTER_ORDER=['SCIENCE','ENGINEERING','INTERDOMAIN','OLYMPUS','OPERATIONS','REFERENCES','OTHER'];
const CLUSTER_LABEL={SCIENCE:'Ciência',ENGINEERING:'Engenharia',INTERDOMAIN:'Interdomínio',OLYMPUS:'Olympus',OPERATIONS:'Operações',REFERENCES:'Referências',OTHER:'Outros'};
function clusterKey(node){const type=String(node?.type||'').toUpperCase();const domain=String(node?.domain||'').toUpperCase();if(type==='FILAMENT')return'INTERDOMAIN';if(type==='REFERENCE'||type==='EVIDENCE')return'REFERENCES';if(domain.includes('OLYMPUS')||domain.includes('BODYBUILD'))return'OLYMPUS';if(domain.includes('ENGINEER'))return'ENGINEERING';if(domain.includes('OPERAT'))return'OPERATIONS';if(domain.includes('SCIENCE')||domain.includes('COSMO')||type==='PROGRAM'||type==='CAMPAIGN')return'SCIENCE';if(type==='WORK'&&domain.includes('SCIENCE'))return'SCIENCE';return'OTHER'}
function clusterId(key){return`${CLUSTER_PREFIX}${key}`}
export function buildAtlasV3Scene(snapshot){
  const sourceNodes=Array.isArray(snapshot?.graph?.root?.nodes)?snapshot.graph.root.nodes:[];const sourceEdges=Array.isArray(snapshot?.graph?.root?.edges)?snapshot.graph.root.edges:[];const canonicalIds=new Set(sourceNodes.map(node=>String(node.id)));const usedKeys=new Set(sourceNodes.map(clusterKey));const keys=CLUSTER_ORDER.filter(key=>usedKeys.has(key));if(!keys.length)keys.push('OTHER');
  const reservedIds=[ROOT_ID,...keys.map(clusterId)];for(const id of reservedIds)if(canonicalIds.has(id))throw new Error(`ATLAS_V3_PRESENTATION_ID_COLLISION:${id}`);
  const root={id:ROOT_ID,type:'ROOT',label:'NEXO',status:'ACTIVE',presentationOnly:true,domain:'SYSTEM'};const clusters=keys.map(key=>({id:clusterId(key),type:'SYSTEM',label:CLUSTER_LABEL[key]||key,status:'ACTIVE',domain:key,presentationOnly:true,layoutParent:ROOT_ID}));
  const canonicalNodes=sourceNodes.map(source=>{const node={...source};const declaredParent=typeof source.parentId==='string'&&canonicalIds.has(source.parentId)?source.parentId:null;node.layoutParent=declaredParent||clusterId(clusterKey(source));return node});
  const presentationEdges=[];for(const key of keys){const hub=clusterId(key);presentationEdges.push({id:`presentation:${ROOT_ID}:${hub}`,source:ROOT_ID,target:hub,type:'CONTAINS',presentationOnly:true});for(const node of canonicalNodes)if(node.layoutParent===hub)presentationEdges.push({id:`presentation:${hub}:${node.id}`,source:hub,target:node.id,type:'CONTAINS',presentationOnly:true})}
  const canonicalEdges=sourceEdges.map(edge=>({...edge}));const nodes=[root,...clusters,...canonicalNodes];const edges=[...presentationEdges,...canonicalEdges];return{graph:{nodes,edges,total:nodes.length,visualTotal:nodes.length,truncated:false,hasMore:false},focusId:ROOT_ID,canonicalIds,presentationIds:new Set(reservedIds)};
}
export{ROOT_ID as ATLAS_V3_PRESENTATION_ROOT,CLUSTER_PREFIX as ATLAS_V3_CLUSTER_PREFIX};
