import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutNodes} from '../graph-lab/graph/layout.mjs';

const root={id:'NEXO'};
const domains=Array.from({length:7},(_,i)=>({id:`D${i}`,parentId:'NEXO'}));
const programs=Array.from({length:6},(_,i)=>({id:`P${i}`,parentId:'D0'}));
const campaigns=Array.from({length:5},(_,i)=>({id:`C${i}`,parentId:'P0'}));
const all=[root,...domains,...programs,...campaigns];
const opts={baseRadius:250,ringGap:132,depthScale:150};

const extent=(values,axis)=>{
 const xs=values.map(v=>v[axis]);
 return Math.max(...xs)-Math.min(...xs);
};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const len=v=>Math.hypot(v[0],v[1],v[2]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=v=>{const n=len(v)||1;return v.map(x=>x/n)};

test('expanded orbital graph occupies real depth',()=>{
 const positions=layoutNodes(all,'NEXO',opts);
 const values=[...positions.values()];
 const z=extent(values,2);
 const xy=Math.max(extent(values,0),extent(values,1));
 assert.ok(z/xy>=.45,`expected z/xy >= 0.45, got ${(z/xy).toFixed(3)}`);
});

test('sub-orbit fan leaves its parent orbital plane',()=>{
 const positions=layoutNodes(all,'NEXO',opts);
 const parent=positions.get('D0');
 const binormal=norm(parent);
 const ratios=programs.map(program=>{
  const d=sub(positions.get(program.id),parent);
  return Math.abs(dot(d,binormal))/len(d);
 });
 const passing=ratios.filter(r=>r>.35).length;
 assert.ok(passing>=Math.ceil(programs.length/2),`expected >= half > .35; got ${ratios.map(x=>x.toFixed(3)).join(', ')}`);
});

test('expanding a branch preserves every existing position',()=>{
 const base=[root,...domains,...programs];
 const before=layoutNodes(base,'NEXO',opts);
 const after=layoutNodes(all,'NEXO',opts);
 for(const node of base)assert.deepEqual(after.get(node.id),before.get(node.id),`moved ${node.id}`);
});

test('layout remains deterministic',()=>{
 assert.deepEqual([...layoutNodes(all,'NEXO',opts)],[...layoutNodes(all,'NEXO',opts)]);
});

test('3D renderer adapter is wired before app and deploy-pinned',()=>{
 const volumePath=new URL('../graph-lab/graph/volume-rendering.mjs',import.meta.url);
 assert.ok(fs.existsSync(volumePath),'volume-rendering.mjs must exist');
 const index=fs.readFileSync(new URL('../graph-lab/index.html',import.meta.url),'utf8');
 const builder=fs.readFileSync(new URL('../graph-lab/build-cdn-index.mjs',import.meta.url),'utf8');
 const volume=index.indexOf('src="./graph/volume-rendering.mjs"');
 const app=index.indexOf('src="./app.mjs"');
 assert.ok(volume>=0&&app>volume,'volume adapter must execute before app.mjs');
 assert.match(builder,/graph\/volume-rendering\.mjs/);
 const source=fs.readFileSync(volumePath,'utf8');
 assert.match(source,/crossVectors/);
 assert.match(source,/Math\.hypot\(\.\.\.position\)/);
 assert.doesNotMatch(source,/requestAnimationFrame|setInterval|setTimeout/);
});
