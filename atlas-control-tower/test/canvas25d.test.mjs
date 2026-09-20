import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESENTATION_ROOT,DOMAIN_PREFIX,buildStructuralIndex,buildCanvas25DLayout,radiusForImportance,zoomCameraAt,stateRole} from '../src/scene/canvas25d.mjs';

const cluster=`${DOMAIN_PREFIX}SCIENCE`;
const nodes=[
  {id:PRESENTATION_ROOT,type:'ROOT',presentationOnly:true},
  {id:cluster,type:'SYSTEM',presentationOnly:true,domain:'SCIENCE',layoutParent:PRESENTATION_ROOT},
  {id:'campaign',type:'CAMPAIGN',layoutParent:cluster},
  {id:'test-a',type:'TEST',layoutParent:'campaign',priority:5},
  {id:'test-b',type:'TEST',layoutParent:'campaign'}
];
const edges=[{source:'campaign',target:'test-a',type:'TESTS'},{source:'campaign',target:'test-b',type:'TESTS'},{source:'test-a',target:'test-b',type:'RELATED'}];

test('structural Z is hierarchy, not random depth',()=>{const index=buildStructuralIndex(nodes,edges);assert.equal(index.get(PRESENTATION_ROOT).level,0);assert.equal(index.get(cluster).level,1);assert.equal(index.get('campaign').level,2);assert.equal(index.get('test-a').level,3);assert.equal(index.get('test-a').domain,'SCIENCE')});
test('layout is deterministic regardless of input order',()=>{const a=buildCanvas25DLayout(nodes,edges);const b=buildCanvas25DLayout([...nodes].reverse(),[...edges].reverse());assert.deepEqual(a,b)});
test('connectivity and priority increase visual importance',()=>{const index=buildStructuralIndex(nodes,edges);assert.ok(index.get('test-a').importance>index.get('test-b').importance);assert.ok(radiusForImportance(index.get('test-a'))>radiusForImportance(index.get('test-b')))});
test('pointer anchored zoom preserves the anchored screen location',()=>{const camera={scale:1,panX:35,panY:-20};const viewport={width:1000,height:700};const anchor={x:720,y:260};const next=zoomCameraAt(camera,anchor,viewport,1.7);const worldX=(anchor.x-viewport.width/2-camera.panX)/camera.scale;const worldY=(anchor.y-viewport.height/2-camera.panY)/camera.scale;assert.ok(Math.abs((viewport.width/2+next.panX+worldX*next.scale)-anchor.x)<1e-9);assert.ok(Math.abs((viewport.height/2+next.panY+worldY*next.scale)-anchor.y)<1e-9)});
test('state is separated from node type',()=>{assert.equal(stateRole('BLOCKED'),'attention');assert.equal(stateRole('CHECKPOINTED'),'pending');assert.equal(stateRole('LIVE'),'healthy');assert.equal(stateRole('UNKNOWN'),'neutral')});
