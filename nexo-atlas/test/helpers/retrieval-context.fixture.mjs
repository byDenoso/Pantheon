/** Test-only authorized source → prepared immutable lookup families. */
import {readSource,importDocuments,authorizedView,digest} from '../../worker/retrieval/source-producer.mjs';
import {prepareView} from '../../worker/retrieval/view-builder.mjs';
import {canonical} from '../../worker/retrieval/python-json.mjs';
import {TOWER_ID} from '../../worker/retrieval/integrity.mjs';
export async function preparedLookup(prepared){
 const p=prepared,rows=new Map(),put=(family,key,value)=>rows.set(JSON.stringify([family,String(key)]),value);
 const meta={scope:p.scope,lengths:p.sparse.lengths,chunks:p.view.chunks.map(c=>({id:c.id,uid:c.uid}))};
 for(const d of p.view.documents)put('document',d.uid,d);
 p.view.chunks.forEach((c,n)=>put('chunk',n,c));
 for(const [family,map]of [['alias',p.aliases],['title',p.titles],['number',p.numbers]])for(const [k,ids]of map)put(family,k,[...ids].sort());
 for(const [uid,graph]of p.graphs)put('graph',uid,graph);
 for(const [term,flat]of p.sparse.postings){const values=Array.from({length:flat.length/2},(_,n)=>[flat[2*n],flat[2*n+1]]);put('term',term,{df:values.length,rows:values});}
 return {manifest:JSON.parse(canonical(p.manifest)),scope:new Map(p.scope),put,
  async metadata(){return meta;},async get(f,k){return rows.get(JSON.stringify([f,String(k)]))??null;},
  async getMany(f,keys){return new Map(await Promise.all(keys.map(async k=>[String(k),await this.get(f,k)])));}};
}
export async function contextFixture(extra={}){
 const now='2026-10-06T14:24:24Z',values={
  'CONTROL.json':{truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE'},
  'entities/test/TEST-A.json':{id:'TEST-A',title:'Frozen QSO test',state:'REJECTED',version:4,roadmap_id:'CAMPAIGN-A',dataset_id:'DATA-A',method:'QSO with Planck prior; frozen cosmologies',statistics:{total:-210.456,QSO:2.560}},
  'entities/test/TEST-B.json':{id:'TEST-B',title:'Same campaign other data',roadmap_id:'CAMPAIGN-A',method:'Supernova sample'},
  'entities/test/TEST-CONTEST.json':{id:'TEST-CONTEST',title:'Contest with different dataset',contests_test_id:'TEST-A',method:'BAO alone'},
  'entities/test/TEST-MENTION.json':{id:'TEST-MENTION',title:'Unlinked correction review evidence',text:'TEST-A Planck QSO correction review evidence interpretation'},
  'entities/test/TEST-REVIEW.json':{id:'TEST-REVIEW',title:'Identity contains a cue'},
  'entities/test/TEST-A-.json':{id:'TEST-A-',title:'Different trailing identity'},
  'entities/roadmap/CAMPAIGN-A.json':{id:'CAMPAIGN-A',title:'Shared campaign'},
  'entities/dataset/DATA-A.json':{id:'DATA-A',title:'QSO with Planck theta prior'},
  'evolution/board.json':{posts:[
    {id:'REVIEW-A',text:'Correção: QSO_z0=+2,560; total=-210,456; prior/CMB-dominada. Preserve REJECTED.',refs:['TEST-A'],at:'2026-10-06T13:27:33Z',expires_at:'2026-10-13T13:27:33Z'},
    {id:'REVIEW-EXPIRED',text:'EXPIRED-CANARY',refs:['TEST-A'],expires_at:now},
    {id:'REVIEW-HIDDEN',text:'HIDDEN-CANARY',refs:['TEST-A'],allowed_roles:['ENGINEER']},
    {id:'REVIEW-INACTIVE',text:'INACTIVE-CANARY',refs:['TEST-A'],state:'RETRACTED'},
    {id:'REVIEW-TWOHOP',text:'TWO-HOP-CANARY',refs:['TEST-B']}
  ]},...extra};
 const files=Object.fromEntries(Object.entries(values).map(([p,value])=>[p,{encoding:'json',value}]));
 const revision='sha256:'+await digest(files),raw=JSON.stringify({contract:'NEXO_TOWER_LIVE_V1',authority:'TOWER_V06',stable_file_id:TOWER_ID,storage:'GOOGLE_DRIVE_PRIVATE',truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK',file_count:Object.keys(files).length,files,revision,state_fingerprint:revision,updated_at:now});
 return preparedLookup(await prepareView(await authorizedView(await importDocuments(await readSource(raw,{fixtureOnly:true})),{role:'LEARNER',now})));
}
