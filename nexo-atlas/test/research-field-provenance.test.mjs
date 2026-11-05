import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResearchRegistry,validateReleasableResearchRegistry,validateAppendOnlyHistory} from '../src/contracts/research-registry.mjs';

// Synthetic software fixture only. No scientific record is added to production.
const questionId='question-synthetic',key='a'.repeat(64),other='b'.repeat(64);
const text=value=>({'pt-BR':value,en:value});
const envelope={commit:'c'.repeat(40),path:'nexo-atlas/worker/public-cosmology.json',sha256:'d'.repeat(64)};
const revision=(version,changeReason=null)=>({analysisId:'SYNTHETIC-analysis',version,status:'published',date:'2026-11-01',datasets:[{name:'SYNTHETIC',doi:'10.1234/synthetic'}],code:{commit:'e'.repeat(40),zenodoDoi:null},result:text('SYNTHETIC result'),uncertainty:text('SYNTHETIC uncertainty'),scope:text('SYNTHETIC scope'),limits:text('SYNTHETIC limits'),evidenceLevel:'unclassified',sourceKeys:[key],changeReason,publication:{doi:'10.1234/synthetic-paper',arxiv:null}});
function fixture(versions=[revision('SYNTHETIC-1')]) {
  const records=new Map(),rows=new Map(),membership=new Map(),entries=[];
  versions.forEach((value,i)=>{
    const hash=i?other:key,pointer=`/records/synthetic-${i}`;
    value={...value,sourceKeys:[hash]};
    const row={result:value.result,research:Object.fromEntries(Object.entries(value).filter(([field])=>field!=='sourceKeys'&&field!=='result'))};
    rows.set(hash,row);membership.set(hash,new Set([questionId]));records.set(hash,[{pointer,row}]);
    const provenance=Object.fromEntries(Object.entries(value).filter(([field,v])=>field!=='sourceKeys'&&v!==null).map(([field])=>[field,{...envelope,pointer:`${pointer}/${field==='result'?'result':`research/${field}`}`} ]));
    entries.push({...value,provenance});
  });
  return {registry:{contract:'NEXO_PUBLIC_RESULT_REGISTRY_V1',records:[{questionId,versions:entries}]},rows,membership,contexts:[{...envelope,records}]};
}
function validate(f) {return validateReleasableResearchRegistry(validateResearchRegistry(f.registry,f.rows,f.membership),f.contexts);}
test('verified field sources permit two scientific versions without rewriting earlier history',()=>{
  const first=fixture(),updated=fixture([revision('SYNTHETIC-1'),revision('SYNTHETIC-2',text('SYNTHETIC correction'))]);
  validate(first);validate(updated);validateAppendOnlyHistory(first.registry,updated.registry);
  assert.equal(updated.registry.records[0].versions[0].version,'SYNTHETIC-1');
  assert.throws(()=>validateAppendOnlyHistory(updated.registry,first.registry),/removida ou alterada/);
});
test('missing source or an unverified commit, path or hash fails closed',()=>{
  for(const field of ['commit','path','sha256']) {
    const f=fixture(),ref=f.registry.records[0].versions[0].provenance.date;
    ref[field]=field==='path'?'private/source.json':(field==='commit'?'f'.repeat(40):'f'.repeat(64));
    assert.throws(()=>validate(f),/origem pública não verificada/);
  }
  const f=fixture();delete f.registry.records[0].versions[0].provenance.version;
  assert.throws(()=>validate(f),/fontes públicas estruturadas/);
  assert.throws(()=>validateReleasableResearchRegistry(f.registry),/fontes públicas estruturadas|origem pública não verificada/);
});
test('a valid pointer in another record or in a website status cannot source scientific metadata',()=>{
  const f=fixture([revision('SYNTHETIC-1'),revision('SYNTHETIC-2',text('SYNTHETIC correction'))]);
  f.registry.records[0].versions[0].provenance.date.pointer='/records/synthetic-1/research/date';
  assert.throws(()=>validate(f),/não pertence ao campo e à pergunta/);
  const status=fixture();status.registry.records[0].versions[0].provenance.status.pointer='/records/synthetic-0/website/status';
  assert.throws(()=>validate(status),/não pertence ao campo e à pergunta/);
});
test('a field value must match the verified public bytes, even if its reference is valid',()=>{
  for(const field of ['version','date','uncertainty','changeReason']) {
    const f=fixture([revision('SYNTHETIC-1',text('SYNTHETIC original reason'))]);
    f.registry.records[0].versions[0][field]=field==='date'?'2026-11-02':field==='version'?'SYNTHETIC-tampered':text('SYNTHETIC tampered');
    assert.throws(()=>validate(f),/diverge da fonte pública/);
  }
});
test('published scientific status requires a sourced DOI or arXiv; website publication is insufficient',()=>{
  const f=fixture();f.registry.records[0].versions[0].publication={doi:null,arxiv:null};
  assert.throws(()=>validate(f),/requires DOI or arXiv/);
});
test('unknown fields remain absent and do not require invented references',()=>{
  const value=revision('SYNTHETIC-unknown');
  for(const field of ['date','datasets','code','uncertainty','scope','limits','evidenceLevel','publication'])value[field]=null;
  value.status='unknown';const f=fixture([value]);delete f.registry.records[0].versions[0].provenance.status;
  validate(f);
});
test('a revision cannot attach an unrelated analysis through another source key',()=>{
 const f=fixture([revision('SYNTHETIC-1'),{...revision('SYNTHETIC-other'),analysisId:'SYNTHETIC-neighbor'}]);
 f.registry.records[0].versions[0].sourceKeys.push(other);
 assert.throws(()=>validate(f),/única chave/);
});
test('a text hash shared by rows declaring different scientific IDs cannot identify a claim',()=>{
 const f=fixture();const context=f.contexts[0],first=context.records.get(key)[0];
 context.records.get(key).push({pointer:'/records/SYNTHETIC-neighbor',row:{...first.row,research:{...first.row.research,analysisId:'SYNTHETIC-neighbor'}}});
 assert.throws(()=>validate(f),/ambíguo entre identidades/);
});
test('one scientific identity cannot fork into independent histories under two questions',()=>{
 const f=fixture();f.registry.records.push({questionId:'question-other',versions:[{...f.registry.records[0].versions[0],version:'SYNTHETIC-2',status:'retracted'}]});
 assert.throws(()=>validate(f),/identity assigned to multiple questions/);
});
