import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('GitHub manifest explicitly authorizes the Drive-backed rich science projection',()=>{
 const authority=JSON.parse(read('../nexo-one/data/canonical.json'));
 assert.equal(authority.authority,'GITHUB');
 assert.equal(authority.scienceProjection?.kind,'GOOGLE_DRIVE');
 assert.equal(authority.scienceProjection?.schema,'nexo-science-drive-github-v1');
 assert.equal(authority.scienceProjection?.role,'PROJECTION_ONLY');
 assert.equal(authority.scienceProjection?.transportPath,'atlas-control-tower/data/science-drive-projection.json');
});

test('graph state and entity routes use the Drive-backed rich science function before generic routes',()=>{
 const vercel=JSON.parse(read('vercel.json'));
 assert.ok(vercel.builds.some(build=>build.src==='api/science.js'));
 const rich=vercel.routes.find(route=>String(route.src).includes('state|graph|entity'));
 assert.equal(rich?.dest,'/api/science.js?route=$1');
});

test('rich science handler is gated by GitHub authority and contains no active database reader',()=>{
 const science=read('api/science.js');
 assert.match(science,/readGithubAuthority/);
 assert.match(science,/assertScienceProjectionAuthorized/);
 assert.match(science,/loadDriveGithubScience/);
 assert.match(science,/loadGithubCanonical/);
 assert.doesNotMatch(science,/atlas\.js|DATA_API|OIDC/i);
});
