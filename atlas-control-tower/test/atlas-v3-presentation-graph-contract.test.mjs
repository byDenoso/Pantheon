import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapterPath=new URL('../src/atlas-v3/scene-adapter.mjs',import.meta.url);

test('presentation graph creates cluster hierarchy with no canonical ID collisions',async()=>{
  assert.equal(fs.existsSync(adapterPath),true,'scene adapter must exist');
  const {buildAtlasV3Scene}=await import(adapterPath);
  const snapshot={manifest:{authority:'TOWER_V06',projectionOnly:true},graph:{root:{nodes:[{id:'A',type:'WORK',domain:'OLYMPUS'},{id:'B',type:'REFERENCE'}],edges:[]}}};
  const scene=buildAtlasV3Scene(snapshot);
  const ids=scene.graph.nodes.map(node=>node.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(scene.canonicalIds.has('__PRESENTATION_NEXO__'),false);
  assert.equal(scene.graph.edges.some(edge=>edge.source==='__PRESENTATION_NEXO__'&&String(edge.target).startsWith('__PRESENTATION_CLUSTER__')),true);
});
