import test from 'node:test';
import assert from 'node:assert/strict';
import {cockpitCopy} from '../ui/cockpit-copy.mjs';

test('unindexed entities receive a Portuguese cockpit fallback instead of index placeholders',()=>{
  const copy=cockpitCopy({type:'SYSTEM',label:'NEXO'});
  assert.match(copy.what,/Sistema NEXO/i);
  assert.match(copy.how,/Atlas/i);
  assert.match(copy.why,/navega|rastre/i);
  for(const value of Object.values(copy))assert.doesNotMatch(value,/não indexado|not indexed/i);
});

test('published PT-BR semantic metadata remains authoritative over fallback copy',()=>{
  const entity={type:'SYSTEM',label:'NEXO',metadata:{what_pt:'O quê publicado',how_pt:'Como publicado',why_pt:'Por quê publicado'}};
  assert.deepEqual(cockpitCopy(entity),{what:'O quê publicado',how:'Como publicado',why:'Por quê publicado'});
});
