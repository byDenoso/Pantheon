import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapterPath=new URL('../src/atlas-v3/scene-adapter.mjs',import.meta.url);

test('presentation graph creates layout clusters without canonical ID collisions or synthetic semantic edges',async()=>{
  assert.equal(fs.existsSync(adapterPath),true,'scene adapter must exist');
  const {buildAtlasV3Scene}=await import(adapterPath);
  const snapshot={manifest:{authority:'TOWER_V06',projectionOnly:true},graph:{root:{nodes:[{id:'A',type:'WORK',domain:'OLYMPUS'},{id:'B',type:'REFERENCE'}],edges:[]}}};
  const scene=buildAtlasV3Scene(snapshot);
  const ids=scene.graph.nodes.map(node=>node.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(scene.canonicalIds.has('__PRESENTATION_NEXO__'),false);
  const olympus=scene.graph.nodes.find(node=>node.id==='__PRESENTATION_CLUSTER__:OLYMPUS');
  const work=scene.graph.nodes.find(node=>node.id==='A');
  assert.equal(olympus?.layoutParent,'__PRESENTATION_NEXO__');
  assert.equal(work?.layoutParent,'__PRESENTATION_CLUSTER__:OLYMPUS');
  assert.equal(scene.graph.edges.some(edge=>edge.presentationOnly),false);
});
