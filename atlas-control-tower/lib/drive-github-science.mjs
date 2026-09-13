import INDEX from '../data/science-drive-projection.json' with {type:'json'};
import {projectGithubCanonical} from './github-canonical-projection.mjs';

const CONTRACT='nexo-science-drive-github-v1';
const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();

function validateIndex(index=INDEX){
 if(index?.contract!==CONTRACT||index?.source!=='GOOGLE_DRIVE'||index?.authority!=='GITHUB'||index?.projectionAuthority!=='GOOGLE_DRIVE')throw new Error('INVALID_DRIVE_GITHUB_SCIENCE_SNAPSHOT');
 return index;
}

export function loadDriveGithubScience(){
 return {index:validateIndex()};
}

const domainNode=domain=>({id:domain.id,type:'DOMAIN',domain:domain.code,label:domain.label||domain.code,status:domain.scientificState||'',summary:domain.question||'',authority:'GITHUB',metadata:{operationalState:domain.operationalState||'',parentHypothesis:domain.parentHypothesis||'',scienceAuthority:domain.authority||'',projectionAuthority:'GOOGLE_DRIVE'}});
const campaignNode=campaign=>({id:campaign.id,type:'CAMPAIGN',label:campaign.label||campaign.id,status:campaign.status||'',summary:campaign.question||'',domain:campaign.domain||'',authority:'GITHUB',metadata:{testCount:campaign.testCount??null,sourceRef:campaign.sourceRef||'',projectionAuthority:'GOOGLE_DRIVE'}});
const publicCompleteness=index=>({campaigns:{included:arr(index.campaigns).length,truncated:false},domains:{included:arr(index.domains).length,truncated:false}});

function base(state){
 const {index}=state;
 return {contract:CONTRACT,source:'github-drive-snapshot',freshness:'SNAPSHOT',sourceVersion:index.sourceVersion,fingerprint:index.fingerprint,authority:'GITHUB',controlAuthority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,sourceRef:index.sourceUrl,usedFallback:false,completeness:publicCompleteness(index)};
}

const graph=(state,focus,nodes,edges,extra={})=>({...base(state),focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:Number(extra.depth||1),cache:'SNAPSHOT',issues:[],...extra});

function scienceRoot(state){
 const root={id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE',summary:'Campanhas científicas projetadas do Drive e autorizadas pelo GitHub.',authority:'GITHUB'};
 const domains=arr(state.index.domains).map(domainNode);
 const cross=arr(state.index.campaigns).filter(item=>!text(item.domain)).map(campaignNode);
 const children=[...domains,...cross];
 return graph(state,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',authority:'GITHUB',declared:true})),{depth:1});
}

function domainGraph(state,code){
 const domain=arr(state.index.domains).find(item=>item.code===code);
 if(!domain)return graph(state,`domain:${code}`,[],[],{depth:2,issues:[{level:'WARN',type:'SCIENCE_DOMAIN_NOT_FOUND',focus:code}]});
 const root=domainNode(domain);
 const campaigns=arr(state.index.campaigns).filter(item=>item.domain===code).map(campaignNode);
 const edges=campaigns.map(campaign=>({id:`contains:${root.id}:${campaign.id}`,source:root.id,target:campaign.id,type:'CONTAINS',authority:'GITHUB',declared:true}));
 return graph(state,root.id,[root,...campaigns],edges,{depth:2,completeness:{...publicCompleteness(state.index),view:{included:campaigns.length,truncated:false}}});
}

function campaignGraph(state,id){
 const campaign=arr(state.index.campaigns).find(item=>item.id===id);
 if(!campaign)return null;
 return graph(state,id,[campaignNode(campaign)],[],{depth:1,completeness:publicCompleteness(state.index)});
}

function scienceEntity(state,id){
 if(id==='system:SCIENCE')return scienceRoot(state).nodes[0];
 const domain=arr(state.index.domains).find(item=>item.id===id||item.code===id);if(domain)return domainNode(domain);
 const campaign=arr(state.index.campaigns).find(item=>item.id===id);if(campaign)return campaignNode(campaign);
 return null;
}

function projectGraph(state,query,genericState){
 const focus=text(query.focus||'system:NEXO');
 if(focus==='system:SCIENCE')return scienceRoot(state);
 if(/^domain:D\d+$/i.test(focus))return domainGraph(state,focus.slice(7).toUpperCase());
 if(/^CAMP-/i.test(focus)){const value=campaignGraph(state,focus);if(value)return value}
 if(/^T-|^result:/i.test(focus))return graph(state,focus,[],[],{issues:[{level:'INFO',type:'SCIENCE_TEST_DETAIL_NOT_PUBLIC',focus}]});
 if(genericState)return projectGithubCanonical(genericState,'graph',query);
 return graph(state,focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_DRIVE_GITHUB_SCIENCE',focus}]});
}

export function projectDriveGithubScience(state,route,query={},options={}){
 const genericState=options.genericState||null;
 if(route==='graph')return projectGraph(state,query,genericState);
 if(route==='state'){
  const generic=genericState?projectGithubCanonical(genericState,'state',query):{};
  const counts={...(generic.counts||{}),DOMAIN:arr(state.index.domains).length,CAMPAIGN:arr(state.index.campaigns).length};
  delete counts.TEST;
  delete counts.RESULT;
  return {...generic,...base(state),counts,science:{domains:arr(state.index.domains).length,campaigns:arr(state.index.campaigns).length,truncated:false}};
 }
 if(route==='entity'){
  const id=text(query.id||query.focus);
  if(/^T-|^result:/i.test(id))return {...base(state),entity:null};
  const entity=scienceEntity(state,id);
  if(entity)return {...base(state),entity};
  if(genericState)return projectGithubCanonical(genericState,'entity',query);
  return {...base(state),entity:null};
 }
 throw new Error(`DRIVE_GITHUB_SCIENCE_ROUTE_UNSUPPORTED:${route}`);
}
