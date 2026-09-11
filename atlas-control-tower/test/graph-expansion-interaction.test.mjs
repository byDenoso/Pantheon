import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const exists=path=>fs.existsSync(new URL(path,root));

test('graph branches expand in place from a clicked anchor',async()=>{
  assert.equal(exists('src/graph-engine/expansion.mjs'),true,'in-place expansion utility must exist');
  if(!exists('src/graph-engine/expansion.mjs'))return;
  const {graftProjection}=await import(new URL('../src/graph-engine/expansion.mjs',import.meta.url));
  const parent={id:'atlas',level:'atlas',focusId:'system:NEXO',nodes:[{id:'system:NEXO',type:'ROOT',x:50,y:50},{id:'science',type:'DOMAIN',x:30,y:40}],edges:[{id:'r',source:'system:NEXO',target:'science',type:'CONTEXT',declared:true}],breadcrumbs:[],capabilities:{}};
  const child={id:'domain:science',level:'domain',focusId:'system:SCIENCE',nodes:[{id:'system:SCIENCE',type:'DOMAIN',x:50,y:50},{id:'D3',type:'SUBGRAPH',x:80,y:50}],edges:[{id:'c',source:'system:SCIENCE',target:'D3',type:'CONTEXT',declared:true}],breadcrumbs:[],capabilities:{}};
  const expanded=graftProjection(parent,'science',child);
  assert.equal(expanded.nodes.some(node=>node.id==='system:SCIENCE'),false,'child root must merge into clicked anchor');
  assert.equal(expanded.nodes.some(node=>node.id==='D3'),true);
  assert.equal(expanded.edges.some(edge=>edge.source==='science'&&edge.target==='D3'),true,'child-root edges must rewire to clicked anchor');
  assert.equal(expanded.nodes.find(node=>node.id==='D3')?.parentId,'science');
});

test('single click drives branch expansion and no v2 page renders Explore',()=>{
  const explorer=read('src/graph-engine/GraphExplorer.tsx');
  assert.match(explorer,/callbacksRef\.current\.onSelect\(node\.id\)/,'Pixi node tap must emit selection immediately');
  for(const page of ['GraphsV2Page.tsx','GraphDomainV2Page.tsx','GraphDetailV2Page.tsx']){
    const source=read('src/pages/'+page);
    assert.doesNotMatch(source,/onOpen=/,'v2 pages must not render the Explore action');
  }
  assert.match(read('src/pages/GraphsV2Page.tsx'),/node\?\.type==='DOMAIN'.*toggleDomain/s);
  assert.match(read('src/pages/GraphsV2Page.tsx'),/node\?\.type==='SUBGRAPH'.*toggleSubgraph/s);
  assert.match(read('src/pages/GraphDomainV2Page.tsx'),/node\?\.type==='SUBGRAPH'.*toggleSubgraph/s);
});

test('graph pages expand branches without route navigation',()=>{
  const atlas=read('src/pages/GraphsV2Page.tsx');
  const domain=read('src/pages/GraphDomainV2Page.tsx');
  assert.doesNotMatch(atlas,/useNavigate/);
  assert.doesNotMatch(domain,/useNavigate/);
  assert.match(atlas,/graftProjection/);
  assert.match(domain,/graftProjection/);
  assert.match(atlas,/api\.graph/);
  assert.match(domain,/api\.graph/);
});
