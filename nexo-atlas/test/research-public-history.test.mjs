import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readPublicSourceContexts,publicSourceContext,publicRowKey} from '../src/contracts/public-history-sources.mjs';
import {validateResearchRegistry,validateReleasableResearchRegistry,validateAppendOnlyHistory} from '../src/contracts/research-registry.mjs';

const text=value=>({'pt-BR':value,en:value});
const original={question:text('SYNTHETIC question'),answers:text('SYNTHETIC answers'),method:text('SYNTHETIC method'),result:text('SYNTHETIC result')};
const metadata=(version,uncertainty,reason=null)=>({analysisId:'SYNTHETIC-analysis',version,status:'unknown',date:null,datasets:null,code:null,uncertainty:text(uncertainty),scope:null,limits:null,evidenceLevel:null,changeReason:reason});
const sourcePath='nexo-atlas/worker/public-cosmology.json';
const catalog=sources=>({contract:'NEXO_PUBLIC_RESEARCH_SOURCES_V1',sources});
const key=publicRowKey(original),membership=new Map([[key,new Set(['question-synthetic'])]]);
const registry=versions=>({contract:'NEXO_PUBLIC_RESULT_REGISTRY_V1',records:[{questionId:'question-synthetic',versions}]});
function revision(spec,sourceKey,meta) {
 const data={...meta,result:original.result,sourceKeys:[key]};
 return {...data,provenance:Object.fromEntries(Object.entries(data).filter(([field,value])=>field!=='sourceKeys'&&value!==null&&!(field==='status'&&value==='unknown')).map(([field])=>[field,{...spec,pointer:`/records/${sourceKey}/${field==='result'?'result':`research/${field}`}`}]))};
}

test('a real Git history preserves v1 at commit A when only uncertainty changes at commit B',()=>{
 const temp=mkdtempSync(join(tmpdir(),'nexo-public-history-'));
 try {
  const git=(...args)=>execFileSync('git',['-C',temp,...args],{encoding:'utf8'}).trim();
  git('init','-q');mkdirSync(join(temp,'nexo-atlas','worker'),{recursive:true});
  const save=(meta,extra=false)=>{
   const bytes=Buffer.from(JSON.stringify({records:{row:{...original,research:meta},...(extra?{another:{...original,research:metadata('SYNTHETIC-other','SYNTHETIC other uncertainty')}}:{})}}));
   writeFileSync(join(temp,sourcePath),bytes);git('add',sourcePath);
   git('-c','user.name=Synthetic Test','-c','user.email=test@example.invalid','commit','-qm','Synthetic public source');
   return {commit:git('rev-parse','HEAD'),path:sourcePath,sha256:createHash('sha256').update(bytes).digest('hex')};
  };
  const metaA=metadata('SYNTHETIC-1','SYNTHETIC uncertainty A'),a=save(metaA);
  const metaB=metadata('SYNTHETIC-2','SYNTHETIC uncertainty B',text('SYNTHETIC correction of uncertainty only')),b=save(metaB,true);
  const prior=registry([revision(a,'row',metaA)]),next=registry([revision(a,'row',metaA),revision(b,'row',metaB)]);
  const sources=readPublicSourceContexts(catalog([a,b]),{cwd:temp,baseCommit:b.commit});
  assert.equal(sources[1].records.get(key).length,2,'equal editorial text must not overwrite distinct source rows');
  validateResearchRegistry(next,new Map([[key,original]]),membership);
  validateReleasableResearchRegistry(next,sources);validateAppendOnlyHistory(prior,next);
  assert.deepEqual(prior.records[0].versions[0],next.records[0].versions[0]);
  assert.throws(()=>validateReleasableResearchRegistry(next,sources.slice(1)),/origem pública não verificada/);
  const changed=structuredClone(next);changed.records[0].versions[0].provenance.uncertainty={...b,pointer:'/records/another/research/uncertainty'};
  assert.throws(()=>validateReleasableResearchRegistry(changed,sources),/diverge da fonte pública/);
  assert.throws(()=>readPublicSourceContexts(catalog([b]),{cwd:temp,baseCommit:a.commit}),/não pertence à base pública/);
  assert.throws(()=>readPublicSourceContexts(catalog([{...a,path:'private/secret.json'}]),{cwd:temp,baseCommit:b.commit}),/fora do contrato/);
  assert.throws(()=>readPublicSourceContexts(catalog([{...a,sha256:'f'.repeat(64)}]),{cwd:temp,baseCommit:b.commit}),/SHA-256/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('source parsing verifies exact public bytes before indexing duplicate editorial hashes',()=>{
 const bytes=Buffer.from(JSON.stringify({records:{a:original,b:original}}));
 const spec={commit:'c'.repeat(40),path:sourcePath,sha256:createHash('sha256').update(bytes).digest('hex')};
 const context=publicSourceContext(spec,bytes);assert.equal(context.records.get(key).length,2);
 assert.throws(()=>publicSourceContext(spec,Buffer.concat([bytes,Buffer.from(' ')])),/SHA-256/);
});
