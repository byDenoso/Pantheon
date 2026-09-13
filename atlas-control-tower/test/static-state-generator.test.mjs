import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateStaticState} from '../lib/campaign-static-state-generator.mjs';
import {validateStaticState} from '../lib/static-state-generator.mjs';

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nexo-state-'));
const read=(root,rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

test('static state generator emits campaign-only science artifacts',async()=>{
  const out=temp();
  const result=await generateStaticState({outDir:out,generatedAt:'2026-09-13T16:30:00.000Z'});
  assert.match(result.fingerprint,/^sha256:[a-f0-9]{64}$/);
  const manifest=read(out,'current/manifest.json');
  const snap=`snapshots/${manifest.fingerprint.slice(7)}`;
  const d7=read(out,`${snap}/science/D7.json`);
  const entities=read(out,`${snap}/entities/index.json`);
  const root=read(out,`${snap}/graph/root.json`);
  const state=read(out,`${snap}/state.json`);
  assert.equal(manifest.contract,'nexo-static-runtime-v1');
  assert.equal(manifest.source,'GOOGLE_DRIVE');
  assert.equal(manifest.codeAuthority,'GITHUB');
  assert.equal(manifest.projectionOnly,true);
  assert.equal(d7.completeness.campaigns.truncated,false);
  assert.ok(d7.campaigns.some(campaign=>campaign.id==='CAMP-CMB-ANOMALIES'));
  assert.equal(Boolean(entities.entities['T-ALENS-001']),false);
  assert.equal(entities.entities['CAMP-CMB-ANOMALIES'].artifact,'science/D7.json');
  assert.ok(root.nodes.some(node=>node.id==='system:OPERATIONS'));
  assert.ok(manifest.artifacts['graph/operations.json']);
  assert.equal(state.projection.authority,'GITHUB');
  assert.equal(state.projection.projectionAuthority,'GOOGLE_DRIVE');
  assert.equal(state.counts.CAMPAIGN,17);
  assert.equal(Object.hasOwn(state.counts,'TEST'),false);
  assert.equal(Object.hasOwn(state.counts,'RESULT'),false);
  assert.ok(state.domains.science>0);
  assert.equal(validateStaticState(out).ok,true);
});

test('semantic fingerprint is stable across generation timestamps',async()=>{
  const a=temp(),b=temp();
  const one=await generateStaticState({outDir:a,generatedAt:'2026-09-13T16:30:00.000Z'});
  const two=await generateStaticState({outDir:b,generatedAt:'2026-09-13T17:30:00.000Z'});
  assert.equal(one.fingerprint,two.fingerprint);
});

test('manifest enumerates content hashes and validator detects tampering',async()=>{
  const out=temp();
  const {fingerprint}=await generateStaticState({outDir:out});
  const snap=path.join(out,'snapshots',fingerprint.slice(7));
  const manifest=read(out,'current/manifest.json');
  assert.ok(manifest.artifacts['science/D7.json']?.sha256);
  fs.appendFileSync(path.join(snap,'science','D7.json'),' ');
  const checked=validateStaticState(out);
  assert.equal(checked.ok,false);
  assert.ok(checked.issues.some(issue=>issue.type==='HASH_MISMATCH'&&issue.artifact==='science/D7.json'));
});
