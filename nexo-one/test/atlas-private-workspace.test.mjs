import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildLab} from '../src/features/lab/model.ts';
import {WORKSPACE_COPY} from '../src/private-workspace/copy.ts';
import {canonicalTestRecord, displayValue, domainSummary, filterTests, hasTestPending, hasTestResult, operationRows, researchHref, testHref, workspaceRoute} from '../src/private-workspace/model.ts';
import {privateWorkspaceState} from './helpers/private-workspace.fixture.mjs';
const state=privateWorkspaceState(),lab=buildLab(state),tests=[...lab.tests.values()];

test('private entry starts on the web; owned routes decode IDs and leave all existing legacy hashes unchanged',()=>{
 for(const hash of ['', '#', '#/', '#/teia', '#/teia/'])assert.deepEqual(workspaceRoute(hash),{page:'web'});
 assert.deepEqual(workspaceRoute('#/teia/organograma'),{page:'organogram'});
 assert.deepEqual(workspaceRoute('#/teia/dominios'),{page:'domains'});
 assert.deepEqual(workspaceRoute(researchHref('OLYMPUS','results')),{page:'research',domain:'OLYMPUS',filter:'results'});
 assert.deepEqual(workspaceRoute(testHref('opaque / id?x=#')),{page:'test',id:'opaque / id?x=#'});
 for(const hash of ['#/agora','#/e/X','#/ACTIONS','#/sistema','#/galaxia'])assert.equal(workspaceRoute(hash),null);
 for(const hash of ['#/teia/unknown','#/teia/teste/%E0%A4%A','#/teia/dominio/'])assert.deepEqual(workspaceRoute(hash),{page:'missing'});
});

test('domain list reuses declared domains, includes Olympus, and never invents a domain without source data',()=>{
 const domains=domainSummary(tests,state);
 assert.deepEqual(domains.map(row=>row.domain),['ENGINEERING','OLYMPUS','SCIENCE']);
 assert.equal(domains.find(row=>row.domain==='OLYMPUS').tests,8);
 assert.deepEqual(domainSummary([],{...state,lanes:[],graph:{nodes:[],edges:[]}}),[]);
 for(const row of domains)assert.equal(row.tests,filterTests(tests,row.domain,'all').length);
});

test('DONE alone is not a result; zero-valued results, inconclusive results and independent pending review remain faithful',()=>{
 const base=tests[0];
 const empty={...base,status:'DONE',result:null,meaning:null,verdictRaw:null,review:null,blocker:null,readiness:null};
 assert.equal(hasTestResult(empty),false); assert.equal(hasTestPending(empty),false);
 assert.equal(hasTestResult({...empty,result:{value:0}}),true);
 assert.equal(hasTestResult({...empty,result:{value:null,unavailable_reason:'not known',source_ref:'private'}}),false);
 assert.equal(hasTestResult({...empty,verdictRaw:'INCONCLUSIVE'}),true);
 for(const verdictRaw of ['PENDING','DONE','UNKNOWN','UNRECOGNIZED'])assert.equal(hasTestResult({...empty,verdictRaw}),false,verdictRaw);
 const pending={...empty,verdictRaw:'INCONCLUSIVE',review:'PENDING_REVIEW'};
 assert.equal(hasTestResult(pending),true);assert.equal(hasTestPending(pending),true);
 assert.equal(hasTestPending({...empty,status:'CHECKPOINTED'}),true);
 assert.equal(filterTests(tests,'OLYMPUS','all','exemplo 3.1').length,1);
});

test('operation groups use explicit state and human gates, avoid duplicate WORK/actions, and keep automatic waiting separate',()=>{
 const rows=operationRows(state);
 assert.equal(rows.filter(row=>row.groups.includes('running')).length,1);
 assert.equal(rows.filter(row=>row.groups.includes('blocked')).length,1);
 assert.equal(rows.filter(row=>row.groups.includes('human')).length,1);
 const wait=rows.find(row=>row.id==='SYNTHETIC-WORK-WAIT');
 assert.ok(wait.groups.includes('waiting'));assert.ok(!wait.groups.includes('blocked'));assert.ok(!wait.groups.includes('human'));
 const human=rows.find(row=>row.groups.includes('human'));assert.match(human.question,/Qual caminho sintético/);
 assert.equal(rows.some(row=>row.id==='SYNTHETIC-WORK-RUN'),false,'canonical WORK behind a typed action is not listed again');
 assert.deepEqual(operationRows({...state,actions:[],projected_work:[],inbox:[],runs:[]}),[]);
});

test('detail uses the canonical read model and strips only evidence wrappers for display; zero and uncertainty survive',()=>{
 const record=canonicalTestRecord(state,'SYNTHETIC-OLYMPUS-3');assert.equal(record.recipe.id,'SYNTHETIC-RECIPE');
 assert.equal(canonicalTestRecord(state,'MISSING'),null);
 assert.equal(displayValue({value:0,source_ref:'private',unavailable_reason:null}), '0');
 assert.equal(displayValue({value:null,unavailable_reason:'not known'}),null);
 assert.match(displayValue({value:{value:0,uncertainty:1},source_ref:'private'}), /"uncertainty": 1/);
 assert.doesNotMatch(displayValue({value:'example',source_ref:'private'}), /private/);
});

test('private presentation does not fetch, mutate, store source content or enter the public import closure',()=>{
 for(const name of ['PrivateWorkspace.tsx','Views.tsx','model.ts']){
  const source=readFileSync(new URL(`../src/private-workspace/${name}`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/fetch\s*\(|localStorage\.setItem|sessionStorage\.setItem|postMessage|XMLHttpRequest|\/api\/|fixtures/);
 }
 const view=readFileSync(new URL('../src/private-workspace/Views.tsx',import.meta.url),'utf8');
 assert.match(view, /<summary>\{m\.data\}<\/summary>/);assert.match(view, /<summary>\{m\.recipe\}<\/summary>/);assert.match(view, /<summary>\{m\.execution\}<\/summary>/);assert.match(view, /<summary>\{m\.review\}<\/summary>/);
 const cosmos=readFileSync(new URL('../src/tower-web/TowerCosmos.tsx',import.meta.url),'utf8');assert.match(cosmos,/tower-open-detail/);
 for(const key of Object.keys(WORKSPACE_COPY['pt-BR']))assert.ok(WORKSPACE_COPY.en[key]?.trim(),key);
});

test('actual React detail keeps data, recipe, execution and review separate; links remain local and source state is unchanged',async()=>{
 const {transpileModule,ScriptTarget,ModuleKind,JsxEmit}=await import('typescript');
 const {writeFileSync,rmSync}=await import('node:fs');
 const {createElement}=await import('react'); const {renderToStaticMarkup}=await import('react-dom/server');
 const source=new URL('../src/private-workspace/Views.tsx',import.meta.url),output=new URL(`../src/private-workspace/.views-test-${process.pid}.mjs`,import.meta.url);
 writeFileSync(output,transpileModule(readFileSync(source,'utf8'),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText);
 const before=structuredClone(state);
 try{
  const {TestDetail,DomainView,ResearchView,OperationView}=await import(output.href);
  for(const lang of ['pt-BR','en']){
   const html=renderToStaticMarkup(createElement(TestDetail,{test:lab.tests.get('SYNTHETIC-OLYMPUS-3'),state,lang}));
   const labels=WORKSPACE_COPY[lang];
   assert.deepEqual([...html.matchAll(/<summary>(.*?)<\/summary>/g)].map(match=>match[1]),[labels.data,labels.recipe,labels.execution,labels.review,labels.technical]);
   assert.match(html,/SYNTHETIC-RECIPE/);assert.match(html,/INCONCLUSIVE|inconclusivo|does not yet support/);
   assert.match(html,/href="#\/e\/SYNTHETIC-OLYMPUS-3"/);
   assert.doesNotMatch(html,/<form|<script|href="https?:/);
  }
  const domains=renderToStaticMarkup(createElement(DomainView,{tests,state,lang:'pt-BR'}));assert.match(domains,/Olympus/);assert.match(domains,/#\/teia\/dominio\/OLYMPUS/);
  const list=renderToStaticMarkup(createElement(ResearchView,{tests,state,domain:'OLYMPUS',filter:'results',lang:'pt-BR'}));assert.equal((list.match(/class="pw-test-row"/g)||[]).length,2);
  const ops=renderToStaticMarkup(createElement(OperationView,{state,lang:'pt-BR'}));assert.match(ops,/Qual caminho sintético/);assert.doesNotMatch(ops,/onClick=|<form/);
  assert.deepEqual(state,before);
 }finally{rmSync(output,{force:true});}
});
