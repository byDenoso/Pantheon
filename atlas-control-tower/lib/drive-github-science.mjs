import INDEX from '../data/science-drive-projection.json' with {type:'json'};
import {projectGithubCanonical} from './github-canonical-projection.mjs';

const CONTRACT='nexo-science-drive-github-v1';
const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const programMode=index=>arr(index?.programs).length>0;

function validateIndex(index=INDEX){
 const driveOwned=upper(index?.source)==='GOOGLE_DRIVE'||upper(index?.authority)==='GOOGLE_DRIVE'||upper(index?.projectionAuthority)==='GOOGLE_DRIVE';
 if(index?.contract!==CONTRACT||!driveOwned)throw new Error('INVALID_DRIVE_GITHUB_SCIENCE_SNAPSHOT');
 return index;
}

export function loadDriveGithubScience(){return {index:validateIndex()}}

const sourceVersion=index=>text(index.sourceVersion||index.sourceModifiedAt||index.generatedAt||index.fingerprint);
const domainNode=domain=>({id:domain.id,type:'DOMAIN',domain:domain.code,label:domain.label||domain.code,status:domain.scientificState||'',summary:domain.question||'',authority:'GITHUB',metadata:{operationalState:domain.operationalState||'',parentHypothesis:domain.parentHypothesis||'',scienceAuthority:domain.authority||'',projectionAuthority:'GOOGLE_DRIVE',childCount:null}});
const programNode=(program,index)=>({id:program.id,type:'PROGRAM',domain:program.domain||'',label:program.title||program.label||program.id,status:program.status||'',summary:program.summary||'',authority:'GITHUB',metadata:{sourceRef:program.sourceRef||'',projectionAuthority:'GOOGLE_DRIVE',childCount:arr(index.campaigns).filter(campaign=>campaign.primaryProgram===program.id).length}});
const campaignNode=campaign=>({id:campaign.id,type:'CAMPAIGN',label:campaign.title||campaign.label||campaign.id,status:campaign.status||'',summary:campaign.question||campaign.summary||'',domain:campaign.domain||'',authority:'GITHUB',metadata:{testCount:campaign.testCount??null,sourceRef:campaign.sourceRef||'',primaryProgram:campaign.primaryProgram||'',projectionAuthority:'GOOGLE_DRIVE',childCount:0}});
const publicCompleteness=index=>({programs:{included:arr(index.programs).length,truncated:false},campaigns:{included:arr(index.campaigns).length,truncated:false},domains:{included:arr(index.domains).length,truncated:false}});

function base(state){
 const {index}=state;
 return {contract:CONTRACT,source:'github-drive-snapshot',freshness:'SNAPSHOT',sourceVersion:sourceVersion(index),fingerprint:index.fingerprint,authority:'GITHUB',controlAuthority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,sourceRef:index.sourceUrl||index.sourceRef||'',usedFallback:false,completeness:publicCompleteness(index)};
}

const graph=(state,focus,nodes,edges,extra={})=>({...base(state),focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:Number(extra.depth||1),cache:'SNAPSHOT',issues:[],...extra});

function scienceRoot(state){
 const root={id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE',summary:programMode(state.index)?'Programas científicos projetados do Drive e autorizados pelo GitHub.':'Campanhas científicas projetadas do Drive e autorizadas pelo GitHub.',authority:'GITHUB'};
 const children=programMode(state.index)
  ?arr(state.index.programs).map(program=>programNode(program,state.index))
  :[...arr(state.index.domains).map(domain=>({...domainNode(domain),metadata:{...domainNode(domain).metadata,childCount:arr(state.index.campaigns).filter(campaign=>campaign.domain===domain.code).length}})),...arr(state.index.campaigns).filter(item=>!text(item.domain)).map(campaignNode)];
 root.metadata={childCount:children.length};
 return graph(state,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',authority:'GITHUB',declared:true})),{depth:1});
}

function programGraph(state,id){
 const program=arr(state.index.programs).find(item=>item.id===id);
 if(!program)return null;
 const root=programNode(program,state.index);
 const campaigns=arr(state.index.campaigns).filter(item=>item.primaryProgram===id).map(campaignNode);
 const edges=campaigns.map(campaign=>({id:`contains:${root.id}:${campaign.id}`,source:root.id,target:campaign.id,type:'CONTAINS',authority:'GITHUB',declared:true}));
 return graph(state,root.id,[root,...campaigns],edges,{depth:2,completeness:{...publicCompleteness(state.index),view:{included:campaigns.length,truncated:false}}});
}

function domainGraph(state,code){
 const domain=arr(state.index.domains).find(item=>item.code===code);
 if(!domain)return graph(state,`domain:${code}`,[],[],{depth:2,issues:[{level:'WARN',type:'SCIENCE_DOMAIN_NOT_FOUND',focus:code}]});
 const campaigns=arr(state.index.campaigns).filter(item=>item.domain===code).map(campaignNode);
 const root={...domainNode(domain),metadata:{...domainNode(domain).metadata,childCount:campaigns.length}};
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
 const program=arr(state.index.programs).find(item=>item.id===id);if(program)return programNode(program,state.index);
 const domain=arr(state.index.domains).find(item=>item.id===id||item.code===id);if(domain)return domainNode(domain);
 const campaign=arr(state.index.campaigns).find(item=>item.id===id);if(campaign)return campaignNode(campaign);
 return null;
}

function projectGraph(state,query,genericState){
 const focus=text(query.focus||'system:NEXO');
 if(focus==='system:SCIENCE')return scienceRoot(state);
 if(arr(state.index.programs).some(item=>item.id===focus)){const value=programGraph(state,focus);if(value)return value}
 if(/^domain:D\d+$/i.test(focus)&&!programMode(state.index))return domainGraph(state,focus.slice(7).toUpperCase());
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
  const counts={...(generic.counts||{}),PROGRAM:arr(state.index.programs).length,DOMAIN:arr(state.index.domains).length,CAMPAIGN:arr(state.index.campaigns).length};
  delete counts.TEST;delete counts.RESULT;
  return {...generic,...base(state),counts,science:{programs:arr(state.index.programs).length,domains:arr(state.index.domains).length,campaigns:arr(state.index.campaigns).length,truncated:false}};
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
