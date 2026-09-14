import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateGithubAuthority} from '../lib/github-authority.mjs';
import {resolveSource} from '../lib/datasource.mjs';
import {SOURCES,provenanceLabel} from '../lib/graph-contract.mjs';

const manifestPath=new URL('../../nexo-one/data/canonical.json',import.meta.url);
const vercelPath=new URL('../vercel.json',import.meta.url);

test('Atlas authority manifest points to TOWER_V06 and keeps projections read-only',async()=>{
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 assert.equal(manifest.contract,'NEXO_ATLAS_AUTHORITY_V2');
 assert.equal(manifest.authority,'TOWER_V06');
 assert.equal(manifest.truthOwner,'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
 assert.equal(manifest.repository,'byDenoso/NEXO-Obsidian-Vault');
 assert.equal(manifest.controlPath,'TOWER_V06/CONTROL.json');
 assert.equal(manifest.projection.role,'READ_ONLY_PROJECTION');
 assert.equal(manifest.rules.projectionCannotWriteBack,true);
 assert.equal(manifest.rules.towerWinsOnDisagreement,true);
 assert.doesNotThrow(()=>validateGithubAuthority(manifest));
 assert.throws(()=>validateGithubAuthority({...manifest,authority:'GITHUB'}),/INVALID_ATLAS_AUTHORITY/);
});

test('Atlas datasource and provenance expose Tower, not Drive, as authority',async()=>{
 const source=await resolveSource();
 assert.equal(source.source,SOURCES.TOWER);
 assert.equal(source.authority,'TOWER_V06');
 assert.equal(source.truthOwner,'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
 assert.equal(source.projectionOnly,true);
 assert.match(provenanceLabel({source:SOURCES.TOWER}),/TOWER_V06/);
});

test('public Atlas state routes no longer prefer legacy Neon science handler',async()=>{
 const vercel=JSON.parse(await readFile(vercelPath,'utf8'));
 const stateRoutes=vercel.routes.filter(route=>String(route.src||'').includes('state'));
 assert.ok(stateRoutes.length>=1);
 assert.equal(stateRoutes.some(route=>String(route.dest||'').includes('science.js')),false);
 assert.equal(stateRoutes.some(route=>String(route.dest||'').includes('runtime-orphans.js')),true);
});
