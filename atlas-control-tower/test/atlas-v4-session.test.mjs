import test from 'node:test';
import assert from 'node:assert/strict';
import {readAtlasSession,writeAtlasSession,ATLAS_SESSION_KEY} from '../src/atlas-v3/session-v4.mjs';

const makeStorage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}};

test('semantic session roundtrips stable navigation state',()=>{
  const storage=makeStorage();
  const input={domain:'SCIENCE',focusId:'CAMP-CMB',selectedId:'CLAIM-17',overlays:['LEARNING'],level:2};
  assert.equal(writeAtlasSession(storage,input),true);
  assert.deepEqual(readAtlasSession(storage),input);
  assert.ok(ATLAS_SESSION_KEY.includes('atlas-neural-v4'));
});

test('storage failures degrade without throwing',()=>{
  const storage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
  assert.equal(readAtlasSession(storage),null);
  assert.equal(writeAtlasSession(storage,{domain:'NEXO'}),false);
});
