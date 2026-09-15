import test from 'node:test';
import assert from 'node:assert/strict';

const {edgeVisualRole,nodeVisualRole,graphRenderBudget}=await import('../src/scene/neural-visuals.mjs');

test('neural node roles encode hierarchy and live signals',()=>{
  assert.equal(nodeVisualRole({id:'n',type:'SYSTEM'}),'core');
  assert.equal(nodeVisualRole({id:'n',type:'DOMAIN'}),'hub');
  assert.equal(nodeVisualRole({id:'n',type:'AUTOMATION'}),'automation');
  assert.equal(nodeVisualRole({id:'n',type:'EVIDENCE'}),'evidence');
  assert.equal(nodeVisualRole({id:'n',type:'WORK',status:'BLOCKED'}),'attention');
  assert.equal(nodeVisualRole({id:'n',type:'CAMPAIGN'}),'signal');
});

test('neural edge roles distinguish hierarchy, evidence, learning and attention',()=>{
  assert.equal(edgeVisualRole({source:'a',target:'b',type:'CONTAINS'}),'hierarchy');
  assert.equal(edgeVisualRole({source:'a',target:'b',type:'SUPPORTS'}),'evidence');
  assert.equal(edgeVisualRole({source:'a',target:'b',type:'CO_DECLARED'}),'learning');
  assert.equal(edgeVisualRole({source:'a',target:'b',type:'CONTRADICTS'}),'attention');
  assert.equal(edgeVisualRole({source:'a',target:'b',type:'RELATED'}),'association');
});

test('render budgets scale by viewport without allowing dense mobile scenes',()=>{
  assert.deepEqual(graphRenderBudget({width:390,height:844,compact:true}),{visibleBudget:56,labelBudget:12});
  assert.deepEqual(graphRenderBudget({width:1440,height:900,compact:false}),{visibleBudget:220,labelBudget:44});
  assert.deepEqual(graphRenderBudget({width:800,height:500,compact:false}),{visibleBudget:140,labelBudget:28});
});
