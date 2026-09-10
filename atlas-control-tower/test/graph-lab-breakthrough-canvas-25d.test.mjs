import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {rendererCapabilities,RENDERERS} from '../graph-lab/graph/renderers/renderer-registry.mjs';
import {visualPreset,VISUAL_PRESETS} from '../graph-lab/graph/renderers/visual-presets.mjs';
import {semanticZoomBand,semanticGraphView,semanticVisibility} from '../graph-lab/graph/renderers/canvas-semantic-zoom.mjs';
import {buildDomainField,buildDomainFields} from '../graph-lab/graph/renderers/canvas-domain-fields.mjs';
import {focusTunnel,focusAlphaForNode,focusAlphaForEdge} from '../graph-lab/graph/renderers/canvas-focus-tunnel.mjs';
import {projectPoint} from '../graph-lab/graph/projection.mjs';
import {filamentStyle} from '../graph-lab/graph/filaments.mjs';
import {PALETTE_A} from '../graph-lab/graph/palette.mjs';
import {resolveExperience} from '../graph-lab/graph/experience/resolve-experience.mjs';
import {focusLabelForNode} from '../graph-lab/graph/experience/node-action-bar.mjs';

const graph={
 rootId:'system:NEXO',
 nodes:[
  {id:'system:NEXO',label:'NEXO',hierarchyLevel:'root',type:'SYSTEM'},
  {id:'lane:SCIENCE',label:'CIÊNCIA',hierarchyLevel:'lane',type:'SYSTEM',parentId:'system:NEXO',system:'SCIENCE'},
  {id:'lane:OLYMPUS',label:'OLYMPUS',hierarchyLevel:'lane',type:'SYSTEM',parentId:'system:NEXO',system:'OLYMPUS'},
  {id:'lane:ENGINEERING',label:'ENGENHARIA',hierarchyLevel:'lane',type:'SYSTEM',parentId:'system:NEXO',system:'ENGINEERING'},
  {id:'program:EXPANSION',label:'EXPANSION',hierarchyLevel:'program',type:'PROGRAM',parentId:'lane:SCIENCE',system:'SCIENCE'},
  {id:'campaign:NULL_AUDIT',label:'Null Audit',hierarchyLevel:'campaign',type:'CAMPAIGN',parentId:'program:EXPANSION',system:'SCIENCE'},
  {id:'memory:null-first',label:'Null-first',hierarchyLevel:'memory',type:'MEMORY',overlayOnly:true,system:'LEARNING'}
 ],
 edges:[
  {id:'e-root-science',source:'system:NEXO',target:'lane:SCIENCE',authority:'canonical'},
  {id:'e-root-olympus',source:'system:NEXO',target:'lane:OLYMPUS',authority:'canonical'},
  {id:'e-root-engineering',source:'system:NEXO',target:'lane:ENGINEERING',authority:'canonical'},
  {id:'e-science-expansion',source:'lane:SCIENCE',target:'program:EXPANSION',authority:'canonical'},
  {id:'e-expansion-null',source:'program:EXPANSION',target:'campaign:NULL_AUDIT',authority:'canonical'},
  {id:'f-null-memory',source:'campaign:NULL_AUDIT',target:'memory:null-first',type:'ALTERNATIVE_FILAMENT',kind:'alternative-validation',associative:true,weight:.9,status:'SUPPORTED_CANDIDATE'}
 ]
};

test('canvas 2.5d contract remains native mobile-safe and depth-capable',()=>{
 assert.equal(RENDERERS['canvas-25d'].implementation,'native');
 assert.equal(RENDERERS['canvas-25d'].mobileSafe,true);
 assert.equal(rendererCapabilities('canvas-25d').supportsDepth,true);
});

test('breakthrough atlas preset is reserved as a rustic mobile-safe canvas preset',()=>{
 assert.ok(VISUAL_PRESETS.BREAKTHROUGH_ATLAS);
 const preset=visualPreset('BREAKTHROUGH_ATLAS');
 assert.equal(preset.stars,90);
 assert.equal(preset.autoOrbit,false);
 assert.equal(preset.semanticZoom,true);
 assert.equal(preset.domainFields,true);
 assert.equal(preset.focusTunnel,true);
 assert.ok(preset.glow<.5);
});

test('semantic zoom maps camera zoom to four product bands',()=>{
 assert.equal(semanticZoomBand(.45),'overview');
 assert.equal(semanticZoomBand(.9),'domain');
 assert.equal(semanticZoomBand(1.6),'program');
 assert.equal(semanticZoomBand(2.6),'audit');
});

test('semantic zoom hides overlay memory at overview but restores contextual memory near audit',()=>{
 const memory=graph.nodes.find(node=>node.overlayOnly);
 assert.equal(semanticVisibility(memory,{band:'overview',selectedId:null,focusId:'system:NEXO',graph}).visible,false);
 const view=semanticGraphView(graph,{cameraZoom:2.6,selectedId:'campaign:NULL_AUDIT',focusId:'campaign:NULL_AUDIT'});
 assert.ok(view.nodes.some(node=>node.id==='memory:null-first'));
 assert.ok(view.edges.some(edge=>edge.id==='f-null-memory'));
 assert.equal(view.nodes.some(node=>node.id==='lane:ENGINEERING'),true,'macro context remains available, only dimmed later by Focus Tunnel');
});

test('domain fields are derived only from visible geometry and never invent node ids',()=>{
 const points=[
  {id:'lane:SCIENCE',x:10,y:10,z:0},
  {id:'program:EXPANSION',x:80,y:20,z:30},
  {id:'campaign:NULL_AUDIT',x:120,y:90,z:45}
 ];
 const field=buildDomainField(points,'lane:SCIENCE');
 assert.deepEqual([...field.nodeIds],points.map(point=>point.id));
 assert.ok(field.radius>=64);
 assert.ok(field.hull.every(point=>points.some(source=>source.id===point.id)));
 const projected=graph.nodes.slice(0,6).map((node,index)=>({node,id:node.id,x:index*30,y:index*20,z:index*8}));
 const fields=buildDomainFields(graph,projected);
 assert.ok(fields.some(item=>item.domainId==='lane:SCIENCE'));
});

test('depth cues are monotonic: nearer z renders larger and more present',()=>{
 const camera={yaw:0,pitch:0,zoom:1,panX:0,panY:0,flat:false};
 const near=projectPoint([0,0,160],camera,1000,700,{focalLength:760});
 const far=projectPoint([0,0,-160],camera,1000,700,{focalLength:760});
 assert.ok(near.scale>far.scale);
 assert.ok(near.depthAlpha>far.depthAlpha);
 assert.ok(near.parallax>far.parallax);
});

test('focus tunnel preserves selected context and dims unrelated graph without expanding all macrodomains',()=>{
 const tunnel=focusTunnel(graph,'campaign:NULL_AUDIT');
 assert.equal(tunnel.active,true);
 for(const id of ['system:NEXO','lane:SCIENCE','program:EXPANSION','campaign:NULL_AUDIT','memory:null-first'])assert.ok(tunnel.nodeIds.has(id),id);
 assert.equal(tunnel.nodeIds.has('lane:ENGINEERING'),false);
 assert.equal(focusAlphaForNode(tunnel,'lane:ENGINEERING'),tunnel.dimAlpha);
 assert.equal(focusAlphaForEdge(tunnel,graph.edges.find(edge=>edge.id==='f-null-memory')),1);
});

test('learning filament grammar uses explicit weight without changing legacy no-weight canonical width',()=>{
 const canonical=filamentStyle({authority:'canonical'},PALETTE_A);
 const canonicalWeighted=filamentStyle({authority:'canonical',weight:.1},PALETTE_A);
 assert.equal(canonical.width,1.35);
 assert.equal(canonicalWeighted.width,1.35);
 const candidate=filamentStyle({type:'ALTERNATIVE_FILAMENT',kind:'alternative-validation',associative:true,weight:.9,status:'CANDIDATE'},PALETTE_A);
 assert.ok(candidate.width>1.25);
 assert.ok(candidate.opacity<1);
 assert.deepEqual(candidate.dash,[4,8]);
 assert.ok(candidate.pulseStrength>.8);
 const contradiction=filamentStyle({type:'ALTERNATIVE_FILAMENT',kind:'alternative-contradiction',associative:true,weight:.8,status:'CONTRADICTION'},PALETTE_A);
 assert.equal(contradiction.pulseDirection,-1);
 assert.ok(contradiction.dash.length>=4);
});

test('BREAKTHROUGH experience resolves to Canvas 2.5D on desktop and mobile',()=>{
 const desktop=resolveExperience({experienceId:'BREAKTHROUGH',width:1440});
 assert.equal(desktop.rendererId,'canvas-25d');
 assert.equal(desktop.rendererPreset,'BREAKTHROUGH_ATLAS');
 assert.equal(desktop.semanticZoom,true);
 assert.equal(desktop.focusTunnel,true);
 const mobile=resolveExperience({experienceId:'BREAKTHROUGH',width:393});
 assert.equal(mobile.rendererId,'canvas-25d');
 assert.ok(mobile.maxLabels<=6);
 assert.ok(mobile.maxVisibleNodes<=42);
 assert.equal(mobile.mobileSemanticAggressive,true);
});

test('legacy canvas renderer is wired to semantic zoom, domain fields and Focus Tunnel',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const source=fs.readFileSync(path.resolve(here,'../graph-lab/graph/legacy-renderer.mjs'),'utf8');
 for(const token of ['canvas-semantic-zoom.mjs','canvas-domain-fields.mjs','canvas-focus-tunnel.mjs','semanticGraphView','buildDomainFields','focusTunnel','semanticBand'])assert.match(source,new RegExp(token));
});

test('node action bar exposes explicit Focus Tunnel clearing language',()=>{
 assert.equal(focusLabelForNode({id:'campaign:NULL_AUDIT'},{isFocused:false}),'FOCAR');
 assert.equal(focusLabelForNode({id:'campaign:NULL_AUDIT'},{isFocused:true}),'LIMPAR FOCO');
});
