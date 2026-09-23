import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

// Tower mínima reproduzindo os achados reais da auditoria de 2026-09-23.
function tower(){
  const root=mkdtempSync(join(tmpdir(),'tower-'));
  const put=(path,value)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),JSON.stringify(value));};
  put('CONTROL.json',{write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK',battery_state:{},x_policy:{}});
  put('entities/work/T-1.json',{work_id:'T-1',status:'READY'});
  put('entities/test/T-1.json',{id:'T-1',status:'INCONCLUSIVE'});
  put('entities/work/WORK-2.json',{work_id:'WORK-2',status:'INCONCLUSIVE',dependency_ids:['WORK::T-1','CAMP-MISSING-1']});
  put('indexes/active-work.json',{count:3,work:[{id:'WORK-2',status:'READY',ops_materialization_probe:{}},{id:'CAND-GONE-1',status:'READY'}]});
  put('contracts/WRITE_CONTRACT_A.json',{write_model:'A'});
  put('contracts/WRITE_CONTRACT_B.json',{write_model:'B',activation:'FORBIDDEN_SUPERSEDED_CONTRACT'});
  return root;
}

test('tower consistency audit detects identity, state, reference and contract drift',()=>{
  let out;
  try{execFileSync('node',['scripts/tower-consistency.mjs','--dir',tower(),'--json'],{encoding:'utf8'});assert.fail('expected ERROR exit');}
  catch(error){out=JSON.parse(error.stdout);}
  const codes=out.summary.by_code;
  assert.equal(codes.DUPLICATE_ID,1);
  assert.equal(codes.STATE_DIVERGENCE,1);
  assert.equal(codes.INDEX_COUNT_DRIFT,1);
  assert.equal(codes.INDEX_ORPHAN,1);
  assert.equal(codes.PROBE_DEBRIS,1);
  assert.equal(codes.UNDECLARED_ALIAS,1);
  assert.equal(codes.DANGLING_REF,1);
  assert.equal(codes.MULTIPLE_WRITE_CONTRACTS,1);
  assert.equal(codes.SUPERSEDED_CONTRACT_PRESENT,1);
  assert.equal(codes.STATE_IN_CONTROL,1);
  assert.equal(out.summary.duplicate_canonical_entities,1);
});
