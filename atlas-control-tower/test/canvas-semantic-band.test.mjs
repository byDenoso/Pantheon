import test from 'node:test';
import assert from 'node:assert/strict';
import {publishSemanticBand,publishFocusTunnelState} from '../graph-lab/graph/renderers/canvas-semantic-band.mjs';

test('semantic band is published to the Atlas DOM contract',()=>{
  const root={dataset:{}};
  const result=publishSemanticBand('overview',{root});
  assert.equal(result,'overview');
  assert.equal(root.dataset.atlasSemanticBand,'overview');
});

test('semantic band publisher tolerates a non-DOM runtime',()=>{
  assert.equal(publishSemanticBand('audit',{root:null}),'audit');
});

test('focus tunnel state is published without inventing graph state',()=>{
  const root={dataset:{}};
  assert.equal(publishFocusTunnelState('node:1',{root}),'node:1');
  assert.equal(root.dataset.atlasFocusTunnel,'active');
  assert.equal(publishFocusTunnelState(null,{root}),null);
  assert.equal(root.dataset.atlasFocusTunnel,'inactive');
});
