import test from 'node:test';
import assert from 'node:assert/strict';
import {readAtlasSession,writeAtlasSession,ATLAS_SESSION_KEY,ATLAS_VIEW_PARAM} from '../src/atlas-v3/session-v4.mjs';
import {serializeSemanticLocation} from '../src/atlas-v3/semantic-v4.mjs';

const makeStorage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))}};

test('semantic session roundtrips stable navigation state',()=>{
  const storage=makeStorage();
  const input={domain:'SCIENCE',focusId:'CAMP-CMB',selectedId:'CLAIM-17',overlays:['LEARNING'],level:2};
  assert.equal(writeAtlasSession(storage,input),true);
  assert.deepEqual(readAtlasSession(storage),input);
  assert.ok(ATLAS_SESSION_KEY.includes('atlas-neural-v4'));
});

test('deep-link semantic state takes precedence over stale session state',()=>{
  const storage=makeStorage();
  writeAtlasSession(storage,{domain:'HEALTH',focusId:'old',selectedId:'',overlays:[],level:1});
  const linked={domain:'SCIENCE',focusId:'CAMP-CMB',selectedId:'CLAIM-17',overlays:['EVIDENCE'],level:2};
  const location={search:`?${ATLAS_VIEW_PARAM}=${encodeURIComponent(serializeSemanticLocation(linked))}`};
  assert.deepEqual(readAtlasSession(storage,location),linked);
});

test('write updates an equivalent shareable URL when browser history is available',()=>{
  const storage=makeStorage();
  let replaced='';
  const history={replaceState(_state,_title,url){replaced=String(url)}};
  const location={href:'https://example.test/Pantheon/?foo=1',search:'?foo=1'};
  const state={domain:'OPERATIONS',focusId:'WORK-1',selectedId:'',overlays:['AUTOMATIONS'],level:2};
  assert.equal(writeAtlasSession(storage,state,history,location),true);
  assert.match(replaced,/foo=1/);
  assert.match(replaced,new RegExp(`${ATLAS_VIEW_PARAM}=`));
});

test('storage failures degrade without throwing',()=>{
  const storage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};
  assert.equal(readAtlasSession(storage),null);
  assert.equal(writeAtlasSession(storage,{domain:'NEXO'}),false);
});
