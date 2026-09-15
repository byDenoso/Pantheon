import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_DOMAINS,
  OVERLAYS,
  semanticDepthForNode,
  buildSemanticVisibility,
  serializeSemanticLocation,
  parseSemanticLocation,
  diffSnapshots
} from '../src/atlas-v3/semantic-v4.mjs';

test('V4 separates primary domains from overlays',()=>{
  assert.deepEqual(PRIMARY_DOMAINS,['NEXO','SCIENCE','OPERATIONS','HEALTH']);
  assert.deepEqual(OVERLAYS,['LEARNING','AUTOMATIONS','EVIDENCE']);
});

test('semantic depth maps hierarchy before local evidence',()=>{
  assert.equal(semanticDepthForNode({type:'ROOT'}),0);
  assert.equal(semanticDepthForNode({type:'DOMAIN'}),0);
  assert.equal(semanticDepthForNode({type:'SYSTEM'}),1);
  assert.equal(semanticDepthForNode({type:'CAMPAIGN'}),2);
  assert.equal(semanticDepthForNode({type:'CLAIM'}),3);
  assert.equal(semanticDepthForNode({type:'EVIDENCE'}),3);
});

test('semantic visibility always preserves focus selection and first degree neighbors',()=>{
  const graph={
    nodes:[
      {id:'root',type:'ROOT'},
      {id:'science',type:'DOMAIN'},
      {id:'campaign',type:'CAMPAIGN'},
      {id:'claim',type:'CLAIM'},
      {id:'far',type:'CLAIM'}
    ],
    edges:[
      {source:'root',target:'science'},
      {source:'science',target:'campaign'},
      {source:'campaign',target:'claim'}
    ]
  };
  const visible=buildSemanticVisibility(graph,{focusId:'campaign',selectedId:'claim',level:1,budget:3});
  assert.ok(visible.has('campaign'));
  assert.ok(visible.has('claim'));
  assert.ok(visible.has('science'));
  assert.equal(visible.has('far'),false);
});

test('global semantic LOD does not expose deep entities merely to fill a render budget',()=>{
  const graph={
    nodes:[
      {id:'root',type:'ROOT'},
      {id:'science',type:'DOMAIN'},
      {id:'campaign-a',type:'CAMPAIGN'},
      {id:'campaign-b',type:'CAMPAIGN'},
      {id:'claim',type:'CLAIM'}
    ],
    edges:[{source:'root',target:'science'}]
  };
  const visible=buildSemanticVisibility(graph,{focusId:'root',level:0,budget:20});
  assert.deepEqual([...visible].sort(),['root','science']);
});

test('semantic location roundtrips through compact URL state',()=>{
  const input={domain:'SCIENCE',focusId:'CAMP-CMB',selectedId:'CLAIM-17',overlays:['LEARNING','EVIDENCE'],level:2};
  assert.deepEqual(parseSemanticLocation(serializeSemanticLocation(input)),input);
});

test('snapshot diff reports added removed and updated entities by id',()=>{
  const previous={entities:{a:{id:'a',status:'ACTIVE'},b:{id:'b',status:'ACTIVE'}}};
  const next={entities:{a:{id:'a',status:'DONE'},c:{id:'c',status:'ACTIVE'}}};
  assert.deepEqual(diffSnapshots(previous,next),{added:['c'],removed:['b'],updated:['a']});
});
