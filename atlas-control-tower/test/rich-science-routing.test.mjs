import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('Tower manifest authorizes the legacy Drive-backed science projection as read-only transport',()=>{
 const authority=JSON.parse(read('../nexo-one/data/canonical.json'));
 assert.equal(authority.authority,'TOWER_V06');
 assert.equal(authority.truthOwner,'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
 assert.equal(authority.scienceProjection?.kind,'LEGACY_GOOGLE_DRIVE_SNAPSHOT');
 assert.equal(authority.scienceProjection?.schema,'nexo-science-drive-github-v1');
 assert.equal(authority.scienceProjection?.role,'READ_ONLY_PROJECTION');
 assert.equal(authority.scienceProjection?.transportPath,'atlas-control-tower/data/science-drive-projection.json');
});

test('graph state and entity routes use the Tower projection runtime before legacy science handlers',()=>{
 const vercel=JSON.parse(read('vercel.json'));
 assert.ok(vercel.builds.some(build=>build.src==='api/science.js'));
 const publicRoute=vercel.routes.find(route=>String(route.src).includes('state|sync|graph|entity'));
 assert.equal(publicRoute?.dest,'/api/runtime-orphans.js?route=$1');
 const legacyPreferred=vercel.routes.find(route=>String(route.src).includes('state|graph|entity')&&String(route.dest).includes('science.js'));
 assert.equal(legacyPreferred,undefined);
});

test('legacy rich science handler remains gated and contains no active database reader',()=>{
 const science=read('api/science.js');
 assert.match(science,/readGithubAuthority/);
 assert.match(science,/assertScienceProjectionAuthorized/);
 assert.match(science,/loadDriveGithubScience/);
 assert.match(science,/loadGithubCanonical/);
 assert.doesNotMatch(science,/atlas\.js|DATA_API|OIDC/i);
});