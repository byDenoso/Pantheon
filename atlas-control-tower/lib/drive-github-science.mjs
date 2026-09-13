import INDEX from '../data/science-drive-projection.json' with {type:'json'};
import CROSS from '../data/science-drive-projection/CROSS.json' with {type:'json'};
import D1 from '../data/science-drive-projection/D1.json' with {type:'json'};
import D2 from '../data/science-drive-projection/D2.json' with {type:'json'};
import D3 from '../data/science-drive-projection/D3.json' with {type:'json'};
import D4 from '../data/science-drive-projection/D4.json' with {type:'json'};
import D5 from '../data/science-drive-projection/D5.json' with {type:'json'};
import D6 from '../data/science-drive-projection/D6.json' with {type:'json'};
import D7 from '../data/science-drive-projection/D7.json' with {type:'json'};
import D8 from '../data/science-drive-projection/D8.json' with {type:'json'};
import D9 from '../data/science-drive-projection/D9.json' with {type:'json'};
import D10 from '../data/science-drive-projection/D10.json' with {type:'json'};
import {projectGithubCanonical} from './github-canonical-projection.mjs';

const CONTRACT='nexo-science-drive-github-v1';
const SHARDS=Object.freeze({CROSS,D1,D2,D3,D4,D5,D6,D7,D8,D9,D10});
const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const unique=values=>[...new Set(values.filter(Boolean))];

function validateIndex(index=INDEX){
 if(index?.contract!==CONTRACT||index?.source!=='GOOGLE_DRIVE'||index?.authority!=='GITHUB'||index?.projectionAuthority!=='GOOGLE_DRIVE')throw new Error('INVALID_DRIVE_GITHUB_SCIENCE_SNAPSHOT');
 return index;
}

export function loadDriveGithubScience(){
 const index=validateIndex();
 for(const [name,shard] of Object.entries(SHARDS))if(shard?.contract!==CONTRACT||shard?.source!=='GOOGLE_DRIVE')throw new Error(`INVALID_DRIVE_GITHUB_SCIENCE_SHARD:${name}`);
 return {index,shards:SHARDS};
}

const allTests=state=>Object.entries(state.shards).flatMap(([shard,body])=>arr(body.tests).map(test=>({...test,shard,domain:text(test.domain||arr(test.domains)[0]||shard)})));
const resultId=id=>`result:${id}`;
const sourceRefs=test=>unique([test.driveSource,test.provenance]).map((sourceRef,index)=>({source:index===0?'GOOGLE_DRIVE':'PROVENANCE',sourceRef}));
const testNode=test=>({id:test.id,canonicalId:test.id,type:'TEST',label:test.label||test.id,status:test.status||'',summary:test.summary||'',domain:test.domain||arr(test.domains)[0]||'',domains:arr(test.domains),authority:'GITHUB',evidenceClass:test.evidenceClass||'',updatedAt:test.lastVerified||'',sourceRefs:sourceRefs(test),metadata:{primaryCampaign:test.primaryCampaign||'',keyMetrics:test.keyMetrics||'',sourceRow:test.sourceRow??null,projectionAuthority:'GOOGLE_DRIVE'}});
const resultNode=test=>({id:resultId(test.id),canonicalId:resultId(test.id),type:'RESULT',label:`Resultado · ${test.label||test.id}`,status:test.status||'',summary:test.summary||'',domain:test.domain||arr(test.domains)[0]||'',authority:'GITHUB',evidenceClass:test.evidenceClass||'',updatedAt:test.lastVerified||'',sourceRefs:sourceRefs(test),metadata:{testId:test.id,keyMetrics:test.keyMetrics||'',derivedFrom:'Test Registry result fields',projectionAuthority:'GOOGLE_DRIVE'}});
const domainNode=domain=>({id:domain.id,type:'DOMAIN',domain:domain.code,label:domain.label||domain.code,status:domain.scientificState||'',summary:domain.question||'',authority:'GITHUB',metadata:{operationalState:domain.operationalState||'',parentHypothesis:domain.parentHypothesis||'',scienceAuthority:domain.authority||'',projectionAuthority:'GOOGLE_DRIVE'}});
const campaignNode=campaign=>({id:campaign.id,type:'CAMPAIGN',label:campaign.label||campaign.id,status:campaign.status||'',summary:campaign.question||'',domain:campaign.domain||'',authority:'GITHUB',metadata:{testCount:campaign.testCount??null,sourceRef:campaign.sourceRef||'',projectionAuthority:'GOOGLE_DRIVE'}});

function base(state){
 const {index}=state;
 const included=Object.values(state.shards).reduce((sum,shard)=>sum+arr(shard.tests).length,0);
 return {contract:CONTRACT,source:'github-drive-snapshot',freshness:'SNAPSHOT',sourceVersion:index.sourceVersion,fingerprint:index.fingerprint,authority:'GITHUB',controlAuthority:'GITHUB',projectionAuthority:'GOOGLE_DRIVE',projectionOnly:true,sourceRef:index.sourceUrl,usedFallback:false,completeness:{...index.completeness,tests:{...index.completeness?.tests,included,truncated:included<(index.completeness?.tests?.declared||included)}}};
}
const graph=(state,focus,nodes,edges,extra={})=>({...base(state),focus,nodes,edges,total:nodes.length,hasMore:Boolean(extra.hasMore),truncated:Boolean(extra.truncated),depth:Number(extra.depth||1),cache:'SNAPSHOT',issues:[],...extra});

function scienceRoot(state){
 const root={id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE',summary:'Projeção científica do Drive persistida e autorizada no GitHub.',authority:'GITHUB'};
 const domains=arr(state.index.domains).map(domainNode);
 return graph(state,root.id,[root,...domains],domains.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',authority:'GITHUB',declared:true})),{depth:1});
}

function domainGraph(state,code){
 const domain=arr(state.index.domains).find(item=>item.code===code);
 if(!domain)return graph(state,`domain:${code}`,[],[],{depth:2,issues:[{level:'WARN',type:'SCIENCE_DOMAIN_NOT_FOUND',focus:code}]});
 const root=domainNode(domain);
 const campaigns=arr(state.index.campaigns).filter(item=>item.domain===code).map(campaignNode);
 const shard=state.shards[code];
 const tests=arr(shard?.tests).map(test=>testNode({...test,domain:code}));
 const results=arr(shard?.tests).map(test=>resultNode({...test,domain:code}));
 const nodes=[root,...campaigns,...tests,...results],edges=[];
 for(const campaign of campaigns)edges.push({id:`contains:${root.id}:${campaign.id}`,source:root.id,target:campaign.id,type:'CONTAINS',authority:'GITHUB',declared:true});
 for(const test of tests){const raw=arr(shard?.tests).find(item=>item.id===test.id),parent=campaigns.find(item=>item.id===raw?.primaryCampaign);edges.push({id:`tests:${parent?.id||root.id}:${test.id}`,source:parent?.id||root.id,target:test.id,type:'TESTS',authority:'GITHUB',declared:true});edges.push({id:`produces:${test.id}:${resultId(test.id)}`,source:test.id,target:resultId(test.id),type:'PRODUCES',authority:'GITHUB',declared:true})}
 const declared=Number(shard?.sample?.declared||domain?.testCount||tests.length),truncated=tests.length<declared;
 return graph(state,root.id,nodes,edges,{depth:3,hasMore:truncated,truncated,completeness:{...base(state).completeness,view:{declared,included:tests.length,truncated}}});
}

function campaignGraph(state,id){
 const campaign=arr(state.index.campaigns).find(item=>item.id===id);
 const rawTests=allTests(state).filter(test=>test.primaryCampaign===id);
 if(!campaign&&!rawTests.length)return null;
 const root=campaignNode(campaign||{id,label:id,status:'',question:'',domain:rawTests[0]?.domain||'',testCount:rawTests.length});
 const tests=rawTests.map(testNode),results=rawTests.map(resultNode),edges=[];
 for(const test of tests){edges.push({id:`tests:${id}:${test.id}`,source:id,target:test.id,type:'TESTS',authority:'GITHUB',declared:true});edges.push({id:`produces:${test.id}:${resultId(test.id)}`,source:test.id,target:resultId(test.id),type:'PRODUCES',authority:'GITHUB',declared:true})}
 const declared=Number(campaign?.testCount||rawTests.length),truncated=tests.length<declared;
 return graph(state,id,[root,...tests,...results],edges,{depth:2,hasMore:truncated,truncated,completeness:{...base(state).completeness,view:{declared,included:tests.length,truncated}}});
}

function testGraph(state,id){
 const test=allTests(state).find(item=>item.id===id);if(!test)return null;
 const testN=testNode(test),result=resultNode(test);
 return graph(state,id,[testN,result],[{id:`produces:${id}:${result.id}`,source:id,target:result.id,type:'PRODUCES',authority:'GITHUB',declared:true}],{depth:1});
}

function scienceEntity(state,id){
 if(id==='system:SCIENCE')return scienceRoot(state).nodes[0];
 const domain=arr(state.index.domains).find(item=>item.id===id||item.code===id);if(domain)return domainNode(domain);
 const campaign=arr(state.index.campaigns).find(item=>item.id===id);if(campaign)return campaignNode(campaign);
 const test=allTests(state).find(item=>item.id===id);if(test)return testNode(test);
 if(id.startsWith('result:')){const source=allTests(state).find(item=>resultId(item.id)===id);if(source)return resultNode(source)}
 return null;
}

function projectGraph(state,query,genericState){
 const focus=text(query.focus||'system:NEXO');
 if(focus==='system:SCIENCE')return scienceRoot(state);
 if(/^domain:D\d+$/i.test(focus))return domainGraph(state,focus.slice(7).toUpperCase());
 if(/^CAMP-/i.test(focus)){const value=campaignGraph(state,focus);if(value)return value}
 if(/^T-/i.test(focus)){const value=testGraph(state,focus);if(value)return value}
 if(genericState)return projectGithubCanonical(genericState,'graph',query);
 return graph(state,focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_DRIVE_GITHUB_SCIENCE',focus}]});
}

export function projectDriveGithubScience(state,route,query={},options={}){
 const genericState=options.genericState||null;
 if(route==='graph')return projectGraph(state,query,genericState);
 if(route==='state'){
  const generic=genericState?projectGithubCanonical(genericState,'state',query):{};
  const tests=allTests(state),resultCount=tests.length;
  return {...generic,...base(state),counts:{...(generic.counts||{}),TEST:tests.length,RESULT:resultCount},science:{domains:state.index.domains.length,campaigns:state.index.campaigns.length,testsIncluded:tests.length,testsDeclared:state.index.completeness?.tests?.declared??null,truncated:tests.length<(state.index.completeness?.tests?.declared||tests.length)}};
 }
 if(route==='entity'){
  const id=text(query.id||query.focus),entity=scienceEntity(state,id);
  if(entity)return {...base(state),entity};
  if(genericState)return projectGithubCanonical(genericState,'entity',query);
  return {...base(state),entity:null};
 }
 throw new Error(`DRIVE_GITHUB_SCIENCE_ROUTE_UNSUPPORTED:${route}`);
}
