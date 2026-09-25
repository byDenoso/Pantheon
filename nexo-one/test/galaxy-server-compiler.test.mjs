import test from 'node:test';
import assert from 'node:assert/strict';
import {compileGalaxySnapshot,deriveChanges,GALAXY_CONTRACT,mapVisualDomain} from '../server/compiler/galaxy-v1.mjs';

const towerCommit='225412698ed9552c9a4fd6038622c9c6bbcea21e';
const projectionFingerprint='sha256:642ce4315c2b0b866976fe95f3e8b01a8b400e5245b59b21972ef6daa97e9343';
function fixture(overrides={}){
  const manifest={authority:'TOWER_V06',event_cursor:'20260918T193842687249Z-ecf6b565',generated_at:null,projection_fingerprint:projectionFingerprint,projection_only:true,tower_commit:towerCommit,tower_repository:'byDenoso/NEXO-Obsidian-Vault',writeback:'FORBIDDEN'};
  return {
    contract:'NEXO_PUBLIC_PROJECTION_V1',event_cursor:manifest.event_cursor,manifest,
    work:[
      {id:'WORK::SCI-1',domain:'SCIENCE',campaign_id:'CAMP-SCI',kind:'ACTION',priority:'HIGH',status:'READY',title:'Science work'},
      {id:'WORK::COSMO-1',domain:'COSMOLOGY',campaign_id:'CAMP-COSMO',kind:'RESEARCH',priority:'CRITICAL',status:'CHECKPOINTED'},
      {id:'WORK::AI-1',domain:'AI',kind:'ENGINEERING_FIX',status:'READY'},
      {id:'WORK::HUMAN-1',domain:'ENGINEERING',dependency_class:'HUMAN_AUTH_REQUIRED',status:'WAIT_DEPENDENCY',priority:'CRITICAL'},
      {id:'WORK::NO-DOMAIN',campaign_id:'CAMP-SCI',status:'READY'},
    ],
    tests:[
      {id:'TEST-1',campaign_id:'CAMP-COSMO',status:'VERIFIED',test_group_id:'TG-1'},
      {id:'TEST-QUEUED',status:'QUEUED'},
    ],
    capabilities:{
      'peer.camb.exact_v2':{backend:'nexo_runtime',status:'ACTIVE'},
      'nexo_state_mutation_v1':{backend:'nexo_runtime',status:'ACTIVE'},
    },
    ...overrides,
  };
}

const interdomain=[{
  id:'META::INTERDOMAIN::1',kind:'INTERDOMAIN',relation_type:'METHOD_TRANSFER',source_domains:['Cosmologia'],target_domains:['Bodybuilding'],status:'TESTING',mapping:'Transfer a method, not a claim.'
}];

test('rejects missing projection',()=>assert.throws(()=>compileGalaxySnapshot(),/projection must be an object/));
test('rejects wrong source contract',()=>assert.throws(()=>compileGalaxySnapshot({projection:{...fixture(),contract:'WRONG'}}),/NEXO_PUBLIC_PROJECTION_V1/));
test('rejects missing work and test arrays',()=>assert.throws(()=>compileGalaxySnapshot({projection:{...fixture(),work:null}}),/work\/tests arrays missing/));
test('rejects split-brain manifest',()=>assert.throws(()=>compileGalaxySnapshot({projection:fixture(),manifestFile:{authority:'WRONG'}}),/manifest file differs/));

test('emits the explicit Galaxy V1 contract and Tower provenance',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  assert.equal(out.contract,GALAXY_CONTRACT);
  assert.equal(out.tower_revision,towerCommit);
  assert.equal(out.provenance.authority,'TOWER_V06');
  assert.equal(out.provenance.source_fingerprint,projectionFingerprint);
  assert.match(out.fingerprint,/^sha256:[0-9a-f]{64}$/);
});

test('creates NEXO core plus the three fixed visual arms',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  assert.deepEqual(out.domains.map(item=>item.domain),['NEXO','SCIENCE','ENGINEERING','OLYMPUS']);
  assert.deepEqual(out.domains[0].layout,{x:0,y:0,z:0,sector:'CORE',lod:'MACRO'});
  assert.deepEqual(out.layout.sectors,['SCIENCE','ENGINEERING','OLYMPUS']);
});

test('maps Tower domain aliases conservatively and preserves source_domain',()=>{
  assert.equal(mapVisualDomain('COSMOLOGY'),'SCIENCE');
  assert.equal(mapVisualDomain('Bodybuilding'),'OLYMPUS');
  assert.equal(mapVisualDomain('AI'),'ENGINEERING');
  assert.equal(mapVisualDomain('unknown'),null);
  const out=compileGalaxySnapshot({projection:fixture()});
  const cosmo=out.entities.find(item=>item.canonical_id==='WORK::COSMO-1');
  const ai=out.entities.find(item=>item.canonical_id==='WORK::AI-1');
  assert.equal(cosmo.domain,'SCIENCE');
  assert.equal(cosmo.source.source_domain,'COSMOLOGY');
  assert.equal(ai.domain,'ENGINEERING');
  assert.equal(ai.source.source_domain,'AI');
});

test('publishes semantic context ids used by the Galaxy breadcrumb',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  const testEntity=out.entities.find(item=>item.canonical_id==='TEST-1');
  assert.equal(testEntity.campaign_id,'CAMP-COSMO');
  assert.equal(testEntity.test_group_id,'TG-1');
  const workEntity=out.entities.find(item=>item.canonical_id==='WORK::SCI-1');
  assert.equal(workEntity.campaign_id,'CAMP-SCI');
});

test('uses campaign consensus only as visual placement, never as canonical domain',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  const entity=out.entities.find(item=>item.canonical_id==='WORK::NO-DOMAIN');
  assert.equal(entity.domain,null);
  assert.equal(entity.visual_domain,'SCIENCE');
  assert.equal(entity.source.derivation,'campaign_consensus_layout');
});

test('keeps unassigned source entities non-canonical while placing them in NEXO',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  const entity=out.entities.find(item=>item.canonical_id==='TEST-QUEUED');
  assert.equal(entity.domain,null);
  assert.equal(entity.visual_domain,'NEXO');
  assert.equal(entity.source.source_domain,null);
});

test('derives presentation subdomains from Tower-backed campaign and capability families',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  const campaign=out.subdomains.find(item=>item.title==='CAMP-COSMO');
  const capability=out.subdomains.find(item=>item.title==='peer.camb');
  assert.equal(campaign.canonical,false);
  assert.equal(campaign.source_basis,'campaign_id');
  assert.equal(campaign.domain,'SCIENCE');
  assert.equal(capability.source_basis,'capability_family');
  assert.equal(capability.domain,'NEXO');
});

test('layout and fingerprint are deterministic under identical input',()=>{
  const a=compileGalaxySnapshot({projection:fixture(),interdomain});
  const b=compileGalaxySnapshot({projection:fixture(),interdomain});
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.snapshot_id,b.snapshot_id);
  assert.deepEqual(a.entities.map(x=>x.layout),b.entities.map(x=>x.layout));
});

test('entity ordering does not affect stable snapshot identity',()=>{
  const p=fixture();
  const a=compileGalaxySnapshot({projection:p,interdomain});
  const b=compileGalaxySnapshot({projection:{...p,work:[...p.work].reverse(),tests:[...p.tests].reverse()},interdomain});
  assert.equal(a.fingerprint,b.fingerprint);
  assert.deepEqual(a.entities,b.entities);
});

test('Needs You requires an explicit human signal',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  assert.deepEqual(out.needs_you.map(item=>item.entity),['work:WORK::HUMAN-1']);
  assert.equal(out.needs_you[0].reason,'HUMAN_AUTH_REQUIRED');
});

test('queued, normal dependency and blocked-like states do not become Needs You by themselves',()=>{
  const p=fixture({work:[
    {id:'A',status:'QUEUED'},
    {id:'B',status:'WAIT_DEPENDENCY',dependency_class:'MIXED'},
    {id:'C',status:'BLOCKED'},
    {id:'D',status:'RUNNING'},
  ],tests:[],capabilities:{}});
  assert.equal(compileGalaxySnapshot({projection:p}).needs_you.length,0);
});

test('explicit interdomain records become semantic relations without inventing scientific edges',()=>{
  const out=compileGalaxySnapshot({projection:fixture(),interdomain});
  const relation=out.relations.find(item=>item.id==='relation:interdomain:META::INTERDOMAIN::1');
  assert.equal(relation.from,'domain:SCIENCE');
  assert.equal(relation.to,'domain:OLYMPUS');
  assert.equal(relation.kind,'METHOD_TRANSFER');
  assert.equal(relation.semantic,true);
  assert.equal(relation.derived,false);
  assert.ok(out.relations.filter(item=>item.semantic).every(item=>item.source?.authority==='TOWER_V06'));
});

test('entities carry relation references for their presentation hierarchy',()=>{
  const out=compileGalaxySnapshot({projection:fixture()});
  const entity=out.entities.find(item=>item.canonical_id==='WORK::SCI-1');
  assert.ok(entity.relation_refs.length>=1);
  assert.ok(entity.relation_refs.every(id=>out.relations.some(relation=>relation.id===id)));
});

test('Changes are empty without a real prior snapshot and derived when one is provided',()=>{
  const first=compileGalaxySnapshot({projection:fixture()});
  assert.deepEqual(first.changes,[]);
  const changed=fixture();
  changed.work=changed.work.filter(item=>item.id!=='WORK::AI-1').map(item=>item.id==='WORK::SCI-1'?{...item,status:'RUNNING'}:item);
  changed.work.push({id:'WORK::NEW',domain:'OLYMPUS',status:'READY'});
  const second=compileGalaxySnapshot({projection:changed,previousSnapshot:first});
  const types=new Map(second.changes.map(item=>[item.entity,item.change_type]));
  assert.equal(types.get('work:WORK::SCI-1'),'UPDATED');
  assert.equal(types.get('work:WORK::AI-1'),'REMOVED');
  assert.equal(types.get('work:WORK::NEW'),'ADDED');
});

test('empty sanctioned state remains valid and does not fabricate entities',()=>{
  const p=fixture({work:[],tests:[],capabilities:{}});
  const out=compileGalaxySnapshot({projection:p});
  assert.equal(out.stats.entities,0);
  assert.equal(out.stats.subdomains,0);
  assert.equal(out.stats.needs_you,0);
  assert.deepEqual(out.entities,[]);
  assert.equal(out.domains.length,4);
});

test('duplicate entity ids fail closed',()=>{
  const p=fixture({work:[{id:'DUP'},{id:'DUP'}],tests:[],capabilities:{}});
  assert.throws(()=>compileGalaxySnapshot({projection:p}),/duplicate entity id work:DUP/);
});

test('deriveChanges is deterministic and importance-sorted',()=>{
  const previous={entities:[{id:'work:A',kind:'WORK',domain:null,visual_domain:'NEXO',subdomain:null,status:'READY',title:'A',importance:.2,priority:null,cluster_id:'x',source:{}},{id:'work:B',kind:'WORK',domain:null,visual_domain:'NEXO',subdomain:null,status:'READY',title:'B',importance:.9,priority:null,cluster_id:'x',source:{}}]};
  const current={entities:[{...previous.entities[0],status:'RUNNING'}]};
  const changes=deriveChanges(previous,current,'2026-09-19T00:00:00.000Z');
  assert.deepEqual(changes.map(x=>x.entity),['work:B','work:A']);
});
