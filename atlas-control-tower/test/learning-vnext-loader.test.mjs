import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLearningSource } from '../src/data/load-learning.ts';

test('learning loader returns the declared report without provider assumptions',async()=>{
 const report={source:'v1',total:136,ladder:[],emergent:[]};
 const api={learning:async()=>report};
 const result=await loadLearningSource(api);
 assert.equal(result.available,true);
 assert.equal(result.report,report);
 assert.equal(result.error,null);
});

test('learning loader degrades to unavailable instead of synthesizing an empty report',async()=>{
 const api={learning:async()=>{throw new Error('offline')}};
 const result=await loadLearningSource(api);
 assert.equal(result.available,false);
 assert.equal(result.report,null);
 assert.equal(result.error,'LEARNING_READ_FAILED');
});
