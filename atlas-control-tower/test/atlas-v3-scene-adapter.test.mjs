import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapterUrl=new URL('../src/atlas-v3/scene-adapter.mjs',import.meta.url);

const sample={
  manifest:{authority:'TOWER_V06',projectionOnly:true,fingerprint:'sha256:test'},
  graph:{root:{nodes:[
    {id:'PROGRAM::A',type:'PROGRAM',label:'Programa A',domain:'SCIENCE'},
    {id:'WORK::B',type:'WORK',label:'Work B',domain:'ENGINEERING'},
    {id:'META::I',type:'FILAMENT',label:'Interdomain',domain:'SCIENCE'}
  ],edges:[{source:'PROGRAM::A',target:'WORK::B',type:'CONTAINS'}]}},
  entities:{}
};

test('scene adapter adds presentation hierarchy without mutating canonical snapshot',async()=>{
  assert.equal(fs.existsSync(adapterUrl),true,'scene adapter must exist');
  const before=JSON.stringify(sample);
  const {buildAtlasV3Scene}=await import(adapterUrl);
  const scene=buildAtlasV3Scene(sample);
  assert.equal(JSON.stringify(sample),before);
  assert.equal(scene.focusId,'__PRESENTATION_NEXO__');
  assert.equal(scene.canonicalIds.size,3);
  assert.equal(scene.graph.nodes.filter(node=>node.presentationOnly).some(node=>node.id==='__PRESENTATION_NEXO__'),true);
  assert.equal(scene.graph.nodes.filter(node=>node.presentationOnly).some(node=>String(node.id).startsWith('__PRESENTATION_CLUSTER__')),true);
  assert.equal(scene.graph.nodes.find(node=>node.id==='WORK::B')?.layoutParent,'__PRESENTATION_CLUSTER__:ENGINEERING');
  assert.equal(scene.graph.nodes.find(node=>node.id==='META::I')?.layoutParent,'__PRESENTATION_CLUSTER__:INTERDOMAIN');
  assert.equal(scene.graph.edges.some(edge=>edge.source==='PROGRAM::A'&&edge.target==='WORK::B'&&edge.type==='CONTAINS'),true);
});
