import test from 'node:test';
import assert from 'node:assert/strict';
import * as semantic from '../src/atlas-v3/semantic-v4.mjs';
import {buildAtlasV3Scene,ATLAS_V3_PRESENTATION_ROOT,ATLAS_V3_CLUSTER_PREFIX} from '../src/atlas-v3/scene-adapter.mjs';

const sceneFixture=()=>buildAtlasV3Scene({
  graph:{
    root:{
      nodes:[
        {id:'PROG-SCI',type:'PROGRAM',domain:'SCIENCE',label:'Science program'},
        {id:'CAMP-SCI',type:'CAMPAIGN',domain:'SCIENCE',parentId:'PROG-SCI',label:'Science campaign'},
        {id:'WORK-SCI',type:'WORK',domain:'SCIENCE',label:'Science work'},
        {id:'WORK-OPS',type:'WORK',domain:'OPERATIONS',label:'Operations work'},
        {id:'ACT-ENG',type:'ACTION',domain:'ENGINEERING',label:'Engineering action'},
        {id:'WORK-HEALTH',type:'WORK',domain:'OLYMPUS',label:'Olympus work'},
        {id:'FIL-1',type:'FILAMENT',domain:'INTERDOMAIN',label:'Learning filament'},
        {id:'AUTO-1',type:'AUTOMATION',domain:'OPERATIONS',label:'Automation'},
        {id:'EVID-1',type:'EVIDENCE',domain:'SCIENCE',label:'Evidence'},
        {id:'MYSTERY',type:'MYSTERY',domain:'UNKNOWN_REALM',label:'Unknown'}
      ],
      edges:[
        {id:'canon:1',source:'PROG-SCI',target:'CAMP-SCI',type:'CONTAINS'},
        {id:'canon:2',source:'WORK-OPS',target:'AUTO-1',type:'EXECUTED_AS'},
        {id:'canon:3',source:'CAMP-SCI',target:'EVID-1',type:'SUPPORTED_BY'},
        {id:'canon:4',source:'WORK-HEALTH',target:'FIL-1',type:'RELATED_TO'}
      ]
    }
  },
  entities:{},
  manifest:{},
  universe:{counts:{}}
});

test('semantic domain routing exposes explicit reusable helpers',()=>{
  assert.equal(typeof semantic.semanticDomainForNode,'function');
  assert.equal(typeof semantic.focusIdForPrimaryDomain,'function');
  assert.equal(typeof semantic.graphForSemanticContext,'function');
  assert.equal(typeof semantic.overlayAvailability,'function');
});

test('semantic domain routing respects declared domain before generic node type',()=>{
  const classify=semantic.semanticDomainForNode;
  assert.equal(classify?.({id:'w1',type:'WORK',domain:'SCIENCE'}),'SCIENCE');
  assert.equal(classify?.({id:'w2',type:'WORK',domain:'OPERATIONS'}),'OPERATIONS');
  assert.equal(classify?.({id:'w3',type:'WORK',domain:'OLYMPUS'}),'HEALTH');
  assert.equal(classify?.({id:'a1',type:'ACTION',domain:'ENGINEERING'}),'NEXO');
  assert.equal(classify?.({id:'p1',type:'PROGRAM',domain:'SCIENCE'}),'SCIENCE');
  assert.equal(classify?.({id:'w4',type:'WORK'}),'UNCLASSIFIED');
  assert.equal(classify?.({id:'x1',type:'MYSTERY',domain:'UNKNOWN_REALM'}),'UNCLASSIFIED');
});

test('semantic domain routing uses distinct focus anchors and distinct graph membership',()=>{
  const scene=sceneFixture();
  const focus=semantic.focusIdForPrimaryDomain;
  assert.equal(focus?.('NEXO'),ATLAS_V3_PRESENTATION_ROOT);
  assert.equal(focus?.('SCIENCE'),`${ATLAS_V3_CLUSTER_PREFIX}SCIENCE`);
  assert.equal(focus?.('OPERATIONS'),`${ATLAS_V3_CLUSTER_PREFIX}OPERATIONS`);
  assert.equal(focus?.('HEALTH'),`${ATLAS_V3_CLUSTER_PREFIX}OLYMPUS`);

  const project=semantic.graphForSemanticContext;
  assert.equal(typeof project,'function');
  const science=project?.(scene,'SCIENCE',[]);
  const operations=project?.(scene,'OPERATIONS',[]);
  const health=project?.(scene,'HEALTH',[]);
  const nexo=project?.(scene,'NEXO',[]);
  const ids=g=>new Set(g.nodes.map(node=>node.id));
  assert.ok(ids(science).has('PROG-SCI'));
  assert.ok(ids(science).has('WORK-SCI'));
  assert.equal(ids(science).has('WORK-OPS'),false);
  assert.ok(ids(operations).has('WORK-OPS'));
  assert.equal(ids(operations).has('WORK-SCI'),false);
  assert.ok(ids(health).has('WORK-HEALTH'));
  assert.equal(ids(health).has('WORK-OPS'),false);
  assert.ok(ids(nexo).has('ACT-ENG'));
  assert.ok(ids(nexo).has('MYSTERY'));
});

test('semantic overlays are additive and availability reflects published entities',()=>{
  const scene=sceneFixture();
  const availability=semantic.overlayAvailability?.(scene);
  assert.deepEqual(availability,{LEARNING:1,AUTOMATIONS:1,EVIDENCE:1});
  const base=semantic.graphForSemanticContext?.(scene,'SCIENCE',[]);
  const withEvidence=semantic.graphForSemanticContext?.(scene,'SCIENCE',['EVIDENCE']);
  assert.equal(base.nodes.some(node=>node.id==='EVID-1'),false);
  assert.equal(withEvidence.nodes.some(node=>node.id==='EVID-1'),true);
});

test('presentation layout is not emitted as canonical semantic edges',()=>{
  const scene=sceneFixture();
  assert.ok(scene.graph.nodes.some(node=>node.presentationOnly&&node.layoutParent===ATLAS_V3_PRESENTATION_ROOT));
  assert.ok(scene.graph.nodes.some(node=>node.id==='PROG-SCI'&&typeof node.layoutParent==='string'));
  assert.deepEqual(scene.graph.edges.map(edge=>edge.id).sort(),['canon:1','canon:2','canon:3','canon:4']);
  assert.equal(scene.graph.edges.some(edge=>edge.presentationOnly),false);
});
