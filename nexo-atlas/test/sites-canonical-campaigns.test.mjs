import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedCampaigns} from '../server/atlas/public-campaign-boundary.mjs';
import {createPublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';
import {campaignPublicProjection} from '../worker/public-campaigns.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {campaignPage, campaignHref, guardPublicCampaign} from '../src/atlas/canonicalPublicCampaigns.ts';
import {loadPublic} from '../src/atlas/publicItems.ts';
const bi=s=>({'pt-BR':s,en:s});
const at='2026-10-08T12:00:00Z';
const campaign=(id='example')=>({id,questionId:'q-'+id,question:bi('Synthetic expansion question '+id),why:null,method:bi('Synthetic only'),currentStage:null,nextStep:null,limitations:[bi('Software fixture, no scientific evidence')],updatedAt:at,state:'ongoing',closure:null,tests:[],testsCoverage:'COMPLETE',references:[]});
const snapshot=(rows=[campaign()],coverage='COMPLETE')=>createPublicCampaignSnapshot(rows,{sourceRevision:'sha256:'+'a'.repeat(64),generatedAt:at,coverage});
test('no approved artifact preserves exact existing 215-test catalog',()=>{
 const old=publicAtlasProjection(), actual=campaignPublicProjection(old);
 assert.equal(actual,old);assert.equal(actual.tests.length,215);assert.equal(actual.campaigns,undefined);
});
test('canonical snapshot preserves bound ids and rejects drift/private families',()=>{
 assert.equal(verifiedCampaigns(snapshot()).campaigns.length,1);
 assert.throws(()=>verifiedCampaigns({...snapshot(),campaigns:[]}),/DRIFT/);
 for(const word of ['PEER','PER','Olympus','BOARD','WORK-secret','PCDM']){
 const c=campaign();c.question=bi('Synthetic '+word);
 assert.throws(()=>verifiedCampaigns(snapshot([c])));
 }
 assert.throws(()=>verifiedCampaigns(snapshot([],'UNAVAILABLE')),/PENDING/);
});

test('pending review cannot expose a scientific result at server or client boundaries',()=>{
 const c=campaign();c.tests=[{id:'pending-review',question:bi('Synthetic test'),method:null,stage:'AWAITING_REVIEW',updatedAt:at,result:{verdict:'SUPPORTS',summary:bi('Synthetic pending result'),limitations:null},references:[]}];
 assert.throws(()=>snapshot([c]),/REVIEW_MISSING/);
 assert.equal(guardPublicCampaign(c).tests[0].result,null);
 c.tests[0].stage='REVIEWED';assert.equal(verifiedCampaigns(snapshot([c])).campaigns[0].tests[0].result.verdict,'SUPPORTS');
});
test('campaign metadata is additive and malformed metadata is explicit unavailable',async()=>{
 const s=snapshot();const body={contract:'ATLAS_PUBLIC_V1',items:[],links:[],campaignsContract:s.contract,...s,contract:'ATLAS_PUBLIC_V1'};
 const read=x=>loadPublic(async()=>Response.json(x));
 const good=await read(body);assert.equal(good.status,'ready');assert.equal(good.campaigns[0].id,'example');
 for(const key of ['generatedAt','sourceRevision','campaignsContract']) assert.equal((await read({...body,[key]:'bad'})).status,'unavailable');
});
test('campaign pagination is stable newest first and links preserve public identity',()=>{
 const rows=Array.from({length:14},(_,i)=>({...campaign('c'+i),updatedAt:`2026-10-${String(i+1).padStart(2,'0')}T12:00:00Z`}));
 const first=campaignPage(rows,{state:'ongoing'});assert.equal(first.items.length,6);assert.equal(first.items[0].id,'c13');assert.equal(first.pages,3);
 assert.equal(campaignPage(rows,{state:'ongoing',page:2}).items.length,2);
 assert.equal(campaignPage(rows,{state:'ongoing',search:'c13'}).total,1);
 assert.equal(campaignHref('a:b'),'\x3fcampanha=a%3Ab#/');assert.equal(rows[0].id,'c0');
});
test('public adapter cannot read Tower and private/MCP implementations are preserved',()=>{
 const source=readFileSync('worker/public-campaigns.mjs','utf8');assert.doesNotMatch(source,/fetch\(|readPrivate|CONNECTORS|readMemory/);
 const worker=readFileSync('worker/index.mjs','utf8');assert.match(worker,/readonlyMcpRoute\(request,env,ctx\?\.props\?\.CONNECTORS\)/);
 assert.doesNotMatch(worker,/APPROVE_AUTONOMY_MANDATE|START_PILOT/);
});
