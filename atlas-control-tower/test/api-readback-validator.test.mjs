import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePayload, forbiddenUiLeak} from '../scripts/api-readback.mjs';

const meta={source:'github',freshness:'SNAPSHOT',sourceVersion:'2026-09-11T16:13:27.114Z',schemaVersion:'drive-ssot-v1',authority:'GITHUB'};

test('health accepts truthful snapshot freshness and rejects missing source version',()=>{
 assert.deepEqual(validatePayload('health',{ok:true,contract:'github-canonical-v2',dataSource:{...meta}}),[]);
 assert.match(validatePayload('health',{ok:true,contract:'github-canonical-v2',dataSource:{...meta,sourceVersion:''}}).join('\n'),/sourceVersion/);
});

test('entity requires normalized metadata and provenance envelope',()=>{
 const payload={...meta,contract:'nexo-entity-v2',entity:{id:'CAMP-CMB-ANOMALIES',canonicalId:'CAMP-CMB-ANOMALIES',label:'CMB anomalies',type:'CAMPAIGN',status:'ACTIVE',domain:'D7',domainLabel:'D7 · CMB',what:null,how:null,why:null,summary:null,authority:'GITHUB',evidenceClass:'PROJECTION',freshness:'SNAPSHOT',sourceVersion:meta.sourceVersion,provenance:[{authority:'GITHUB',sourceVersion:meta.sourceVersion,freshness:'SNAPSHOT'}],relations:[],actions:[],availability:{summary:'ABSENT'}}};
 assert.deepEqual(validatePayload('entity',payload),[]);
 const broken=structuredClone(payload);broken.entity.provenance=[];
 assert.match(validatePayload('entity',broken).join('\n'),/provenance/);
});

test('universe cannot encode missing synthesis as INCONCLUSIVE',()=>{
 const good={...meta,contract:'nexo-universe-v2',synthesis:{availability:'UNAVAILABLE',status:'UNAVAILABLE',summary:null,conclusion:null,reason:'NO_PUBLISHED_SYNTHESIS_IN_AUTHORIZED_PROJECTION',provenance:[]},parameters:[],tensions:[],directionalSignals:[],sections:[]};
 assert.deepEqual(validatePayload('universe',good),[]);
 const bad=structuredClone(good);bad.synthesis.status='INCONCLUSIVE';
 assert.match(validatePayload('universe',bad).join('\n'),/absence.*INCONCLUSIVE/i);
});

test('readback detects legacy technical UI leaks and generic placeholders',()=>{
 for(const value of ['DERIVED_NOT_EVIDENCE','Conteúdo ainda não indexado em português','Sem síntese publicada para esta pergunta no payload atual']) assert.equal(forbiddenUiLeak(value),true);
 assert.equal(forbiddenUiLeak('Não publicado na projeção atual.'),false);
});
