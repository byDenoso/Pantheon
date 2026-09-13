import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('GitHub manifest explicitly authorizes the rich science_v1 projection',()=>{
 const authority=JSON.parse(read('../nexo-one/data/canonical.json'));
 assert.equal(authority.authority,'GITHUB');
 assert.equal(authority.scienceProjection?.schema,'science_v1');
 assert.equal(authority.scienceProjection?.role,'PROJECTION_ONLY');
});

test('graph state and entity routes use the rich science function before the generic canonical fallback',()=>{
 const vercel=JSON.parse(read('vercel.json'));
 assert.ok(vercel.builds.some(build=>build.src==='api/atlas.js'));
 const rich=vercel.routes.find(route=>String(route.src).includes('state|graph|entity'));
 assert.equal(rich?.dest,'/api/atlas.js?route=$1');
});

test('rich science handler is gated by GitHub authority and keeps a canonical fallback',()=>{
 const atlas=read('api/atlas.js');
 assert.match(atlas,/readGithubAuthority/);
 assert.match(atlas,/assertScienceProjectionAuthorized/);
 assert.match(atlas,/projectGithubCanonical/);
 assert.match(atlas,/SCIENCE_V1_UNAVAILABLE/);
});
