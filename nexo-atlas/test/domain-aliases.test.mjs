import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDomain, resolveDomain} from '../src/shared/domain-identity.mjs';
import {compileDomainCatalog} from '../server/atlas/domain-catalog.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {buildLab} from '../src/features/lab/model.ts';
import {domainSummary, domainOutline, filterTests, workspaceRoute} from '../src/private-workspace/model.ts';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {queryKnowledge} from '../worker/knowledge.mjs';
import {memoryDocuments} from '../worker/memory.mjs';
const revision='sha256:'+'e'.repeat(64), ctx={revision,sourceRef:'https://example.invalid/private'};
const contract={owner_domain:'SCIENCE',subdomains:['COSMOLOGY','PHYSICS'],_source_path:'contracts/SCIENCE_DOMAIN_ROUTING_V1.json'};
const t=(id,domain='SCIENCE',extra={})=>({id,domain,kind:'TEST',status:'READY',name:id,...extra});
const rows=()=>({domainContracts:[contract],tests:[t('T1','SCIENCE',{semantic:{subdomain_id:'science.cosmology.h0',topic_id:'science.cosmology.expansion'}}),t('T2','Cosmologia'),t('T3','COSMOLOGY',{status:'RETIRED'}),t('T4','SCIENCE',{semantic:{subdomain_id:'science.methods.robustness'}})]});
const get=(catalog,id)=>catalog.domains.find(d=>d.id===id);
const add=(tower,path,value)=>{tower.files[path]={encoding:'json',value};tower.file_count=Object.keys(tower.files).length;};

test('known exact bilingual aliases share an identity; unrelated names and identifiers do not',()=>{
 for(const [a,b] of [['Cosmologia','COSMOLOGY'],['Cosmology','COSMOLOGY'],['Ciência','SCIENCE'],['Engenharia','ENGINEERING'],['Saúde','HEALTH'],['Fisiculturismo','BODYBUILDING']])assert.equal(canonicalDomain(a),b);
 assert.equal(resolveDomain('Cosmologia').basis,'TRANSLATION_ALIAS');
 for(const [a,b] of [['SCIENCE','COSMOLOGY'],['NEXO','ENGINEERING'],['ARTIFACT','ENGINEERING'],['BODYBUILDING','OLYMPUS'],['a-b','a_b'],['Cosmology surveys','COSMOLOGY']])assert.notEqual(canonicalDomain(a),canonicalDomain(b));
 assert.equal(canonicalDomain({domain:'SCIENCE'}),'UNMAPPED');assert.equal(canonicalDomain(''),'UNMAPPED');
});
test('catalog counts identities once and records direct, explicit descendant and retired membership',()=>{
 const input=rows();input.tests.push({...input.tests[0]}); const before=JSON.stringify(input),catalog=compileDomainCatalog(input,ctx),cosmo=get(catalog,'COSMOLOGY'),science=get(catalog,'SCIENCE');
 assert.deepEqual(cosmo.counts,{entities:3,tests:3,direct_tests:2,inherited_tests:1,current_tests:2,retired_tests:1});
 assert.equal(science.counts.tests,4);assert.equal(cosmo.members.filter(row=>row.canonical_id==='T1').length,1);
 assert.equal(cosmo.members.find(row=>row.canonical_id==='T1').traces[0].basis,'EXPLICIT_SEMANTIC_PATH');
 assert.ok(cosmo.members.every(row=>row.traces.every(trace=>trace.source_revision===revision)));
 assert.equal(JSON.stringify(input),before);assert.equal(catalog.scientific_authority,false);
});
test('semantic similarity and undeclared hierarchy never become membership; malformed metadata is safe',()=>{
 const input={tests:[t('T1','SCIENCE',{title:'Cosmology research',semantic:{subdomain_id:'science.cosmology.h0'}}),t('T2','SCIENCE',{semantic:{subdomain_id:'science.cosmologyish'}}),t('T3','OLYMPUS',{semantic:{topic_id:'science.cosmology.h0'}}),null,{},t('T4',{})]};
 let catalog=compileDomainCatalog(input,ctx);assert.equal(get(catalog,'COSMOLOGY'),undefined);
 input.domainContracts=[contract];catalog=compileDomainCatalog(input,ctx);
 assert.equal(get(catalog,'COSMOLOGY').counts.tests,1);assert.equal(get(catalog,'UNMAPPED').counts.tests,1);
});
test('cyclic contracts cannot multiply counts and historical tests stay outside current totals',()=>{
 const input=rows();input.domainContracts.push({owner_domain:'COSMOLOGY',subdomains:['SCIENCE']});input.tests.push(t('T5','Cosmologia',{historical:true}));
 const catalog=compileDomainCatalog(input,ctx);assert.equal(get(catalog,'SCIENCE').counts.tests,2);assert.equal(get(catalog,'COSMOLOGY').counts.tests,2);assert.equal(get(catalog,'COSMOLOGY').counts.retired_tests,1);assert.equal(catalog.quarantined_relations.length,2);
});
test('runtime carries alias evidence without changing canonical records, entity IDs or science relations',()=>{
 const tower=makePrivateTowerFixture();add(tower,'contracts/SCIENCE_DOMAIN_ROUTING_V1.json',contract);
 for(const row of rows().tests)add(tower,`entities/test/${row.id}.json`,row);
 add(tower,'entities/interdomain/ALIAS.json',{id:'ALIAS',source_domains:['Cosmologia'],target_domains:['ENGINEERING'],relation_type:'METHOD_TRANSFER'});
 const before=JSON.stringify(tower),state=compilePrivateTowerRuntime(tower).data.system,lab=buildLab(state),tests=[...lab.tests.values()];
 assert.equal(JSON.stringify(tower),before);assert.equal(state.read_model.tests.T2.domain,'Cosmologia');assert.ok(state.graph.nodes.some(n=>n.id==='test:T2'));assert.ok(state.graph.edges.some(e=>e.from==='domain:Cosmologia'&&e.to==='test:T2'));
 assert.equal(domainSummary(tests,state).filter(row=>row.domain==='COSMOLOGY').length,1);
 assert.equal(filterTests([...tests,tests.find(t=>t.id==='T1')],'Cosmologia','all','',state).length,3);
 assert.equal(filterTests(tests,'Cosmology','all','',state).length,3);assert.equal(filterTests(tests,null,'all','Cosmologia',state).length,3);
 assert.equal(domainOutline(tests,lab,state,'Cosmologia').inheritedTests,1);
 assert.deepEqual(workspaceRoute('#/teia/dominio/Cosmologia'),{page:'research',domain:'COSMOLOGY',filter:'all'});
 assert.equal(domainSummary(tests,{...state,bus:{...state.bus,fingerprint:'different'}}).find(row=>row.domain==='COSMOLOGY').tests,2);
});
test('catalog is stable across input ordering and adding unrelated data cannot change another domain',()=>{
 const input=rows(),first=compileDomainCatalog(input,ctx);input.tests.reverse();assert.deepEqual(compileDomainCatalog(input,ctx),first);
 input.tests.push(t('UNRELATED','ENGINEERING'));assert.deepEqual(get(compileDomainCatalog(input,ctx),'COSMOLOGY'),get(first,'COSMOLOGY'));
});
test('knowledge filter resolves translations and explicit descendants while preserving source IDs and privacy',()=>{
 const tower=memoryFixture();add(tower,'contracts/SCIENCE_DOMAIN_ROUTING_V1.json',contract);
 add(tower,'entities/test/C1.json',t('C1','Cosmologia'));add(tower,'entities/test/C2.json',t('C2','COSMOLOGY'));add(tower,'entities/test/C3.json',t('C3','SCIENCE',{semantic:{subdomain_id:'science.cosmology.h0'}}));
 add(tower,'entities/test/C4.json',t('C4','COSMOLOGY',{status:'RETIRED'}));
 add(tower,'entities/test/SECRET.json',t('SECRET','Pessoal',{title:'DO_NOT_EXPOSE'}));
 const view=queryKnowledge(tower,{domain:'Cosmologia',depth:0,limit:100});assert.deepEqual(view.nodes.map(n=>n.object_id),['C1','C2','C3']);assert.equal(view.domains.find(d=>d.id==='COSMOLOGY').count,3);
 assert.equal(view.nodes.find(n=>n.object_id==='C1').semantic.domain_id,'Cosmologia');assert.equal(view.nodes.find(n=>n.object_id==='C1').semantic.grouping_domain_id,'COSMOLOGY');
 assert.equal(queryKnowledge(tower,{domain:'Cosmology',include_history:true}).nodes.length,4);
 assert.equal(JSON.stringify(memoryDocuments(tower)).includes('DO_NOT_EXPOSE'),false);assert.equal(JSON.stringify(view).includes('DO_NOT_EXPOSE'),false);
 assert.ok(queryKnowledge(tower,{query:'Cosmologia'}).nodes.some(n=>n.object_id==='C2'));assert.ok(queryKnowledge(tower,{query:'Cosmologia'}).nodes.some(n=>n.object_id==='C3'));
});

test('synthetic campaign wrappers never add a second canonical entity to domain totals',()=>{const catalog=compileDomainCatalog({roadmaps:[{id:'R1',domain:'SCIENCE'}],campaigns:[{id:'C1',domain:'SCIENCE',_derived_from_roadmap:true}]},ctx);assert.equal(get(catalog,'SCIENCE').counts.entities,1);assert.equal(catalog.synthetic_records_counted,false);});


test('resolved private descendants and ancestors stay outside request-local knowledge readers',()=>{
 for(const excluded of ['OLYMPUS','PERSONAL','HEALTH','BODYBUILDING','PEER']){
  const tower=memoryFixture();
  add(tower,'contracts/SCIENCE_DOMAIN_ROUTING_V1.json',{owner_domain:'SCIENCE',subdomains:[excluded]});
  add(tower,'entities/test/DERIVED-PRIVATE.json',t('DERIVED-PRIVATE','SCIENCE',{semantic:{subdomain_id:`science.${excluded.toLowerCase()}.topic`},title:'Never expose through derived membership'}));
  assert.equal(queryKnowledge(tower,{domain:excluded,include_history:true}).nodes.some(n=>n.object_id==='DERIVED-PRIVATE'),false);
  assert.equal(queryKnowledge(tower,{query:'DERIVED-PRIVATE',include_history:true}).nodes.length,0);
  assert.equal(memoryDocuments(tower).some(n=>n.object_id==='DERIVED-PRIVATE'),false);
  // In the other direction, a public-sounding child of a private parent must remain excluded too.
  add(tower,'contracts/PRIVATE_DOMAIN_ROUTING_V1.json',{owner_domain:excluded,subdomains:['ASTROPHYSICS']});
  add(tower,'entities/test/PRIVATE-ANCESTOR.json',t('PRIVATE-ANCESTOR','ASTROPHYSICS'));
  assert.equal(queryKnowledge(tower,{query:'PRIVATE-ANCESTOR',include_history:true}).nodes.length,0);
 }
});

test('privacy checks structured domain segments and aliases without matching lookalike words',()=>{
 const tower=memoryFixture();
 for (const [i,segment] of ['OLYMPUS','PERSONAL','HEALTH','PEER','Saúde','Pessoal','Fisiculturismo'].entries())
  add(tower,`entities/test/EXCLUDED-SEGMENT-${i}.json`,t(`EXCLUDED-SEGMENT-${i}`,'SCIENCE',{semantic:{topic_id:`science.${segment}.topic`}}));
 for (const [i,segment] of ['healthcare','personalization','olympusish'].entries())
  add(tower,`entities/test/ALLOWED-SEGMENT-${i}.json`,t(`ALLOWED-SEGMENT-${i}`,'SCIENCE',{semantic:{subdomain_id:`science.${segment}.topic`}}));
 const records=memoryDocuments(tower),graph=queryKnowledge(tower,{limit:100});
 assert.equal(records.some(row=>row.object_id.startsWith('EXCLUDED-SEGMENT-')),false);
 assert.equal(graph.nodes.some(row=>row.object_id.startsWith('EXCLUDED-SEGMENT-')),false);
 assert.equal(records.filter(row=>row.object_id.startsWith('ALLOWED-SEGMENT-')).length,3);
 assert.equal(graph.nodes.filter(row=>row.object_id.startsWith('ALLOWED-SEGMENT-')).length,3);
});

const olympusContract={owner_domain:'OLYMPUS',domain_surface:'02_DOMAINS/Bodybuilding/',_source_path:'contracts/OLYMPUS_DOMAIN_ROUTING_V1.json'};
const surfaceRows=()=>({domainContracts:[olympusContract],tests:[t('O1','OLYMPUS')],interdomain:[{id:'LINK',source_domains:['Bodybuilding'],target_domains:['Bodybuilding']}]});
test('empty reference surface gets a traced navigation redirect without merging canonical domains or counts',()=>{
 const input=surfaceRows(),before=JSON.stringify(input),catalog=compileDomainCatalog(input,ctx),surface=get(catalog,'BODYBUILDING'),owner=get(catalog,'OLYMPUS');
 assert.equal(surface.navigation_redirect.to,'OLYMPUS');assert.equal(surface.navigation_redirect.evidence[0].field,'domain_surface');assert.equal(surface.navigation_redirect.evidence[0].path,olympusContract._source_path);
 assert.equal(surface.counts.entities,0);assert.equal(surface.members.length,0);assert.equal(owner.counts.tests,1);assert.deepEqual(owner.navigation_surfaces,['BODYBUILDING']);
 assert.notEqual(canonicalDomain('Bodybuilding'),canonicalDomain('Olympus'));assert.equal(JSON.stringify(input),before);
});
test('nonempty, independently declared, ambiguous or conflicting surfaces remain distinct',()=>{
 const cases=[input=>input.tests.push(t('B1','Bodybuilding')),input=>input.domainContracts.push({owner_domain:'BODYBUILDING',subdomains:[]}),input=>input.domainContracts.push({owner_domain:'OTHER',domain_surface:'02_DOMAINS/Bodybuilding/'}),input=>input.domainContracts.push({owner_domain:'SCIENCE',subdomains:['BODYBUILDING']})];
 for(const mutate of cases){const input=surfaceRows();mutate(input);const catalog=compileDomainCatalog(input,ctx);assert.equal(get(catalog,'BODYBUILDING').navigation_redirect,null);assert.deepEqual(get(catalog,'OLYMPUS').navigation_surfaces,[]);}
 const input=surfaceRows();input.domainContracts=[];assert.equal(get(compileDomainCatalog(input,ctx),'BODYBUILDING').navigation_redirect,null);
});
test('private UI display uses surface owner for bookmarks/search while raw provenance remains separate',()=>{
 const tower=makePrivateTowerFixture();add(tower,'contracts/OLYMPUS_DOMAIN_ROUTING_V1.json',olympusContract);add(tower,'entities/interdomain/SURFACE.json',{id:'SURFACE',source_domains:['Bodybuilding'],target_domains:['Bodybuilding']});
 const state=compilePrivateTowerRuntime(tower).data.system,lab=buildLab(state),tests=[...lab.tests.values()];
 assert.equal(domainSummary(tests,state).some(row=>row.domain==='BODYBUILDING'),false);assert.equal(filterTests(tests,'Bodybuilding','all','',state).length,1);assert.equal(filterTests(tests,null,'all','Fisiculturismo',state).length,1);
 assert.equal(domainOutline(tests,lab,state,'Bodybuilding').domain,'OLYMPUS');assert.equal(state.domain_catalog.domains.find(row=>row.id==='BODYBUILDING').counts.tests,0);assert.equal(state.read_model.tests['TEST-01'].domain,'OLYMPUS');
 assert.equal(filterTests(tests,'Bodybuilding','all','',{...state,bus:{...state.bus,fingerprint:'stale'}}).length,0);
 // Public/role-scoped retrieval does not adopt owner-private navigation aliases.
 assert.equal(queryKnowledge(tower,{query:'Bodybuilding',include_history:true}).nodes.some(row=>row.object_id==='TEST-01'),false);
});
