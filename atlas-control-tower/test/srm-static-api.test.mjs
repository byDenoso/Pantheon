import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createStaticArtifactApi} from '../lib/multisurface-static-api.mjs';

function fileFetch(root){
  return async url=>{
    const rel=String(url).replace(/^\/data\/?/,'');
    const file=path.join(root,rel);
    if(!fs.existsSync(file))return {ok:false,status:404,text:async()=>'',json:async()=>{throw new Error('404')}};
    const body=fs.readFileSync(file,'utf8');
    return {ok:true,status:200,text:async()=>body,json:async()=>JSON.parse(body)};
  };
}

test('static API reads and hash-verifies Manifest V3 and SRM V2',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-srm-api-'));
  execFileSync(process.execPath,['scripts/generate-static-state.mjs',out],{cwd:process.cwd(),stdio:'pipe'});
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:fileFetch(out)});
  const manifest=await api.publicManifestV3();
  const srm=await api.scienceReadModel();
  assert.equal(manifest.contract,'NEXO_ATLAS_PUBLIC_MANIFEST_V3');
  assert.equal(srm.contract,'NEXO_SCIENCE_READ_MODEL_V2');
  assert.ok(srm.observations.some(item=>item.metricId==='cosmology.H0'));
  const envelope=await api.research('science-read-model');
  assert.equal(envelope.data.contract,'NEXO_SCIENCE_READ_MODEL_V2');
});

test('static API exposes changes and observation collections from the same promoted snapshot',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-srm-api-'));
  execFileSync(process.execPath,['scripts/generate-static-state.mjs',out],{cwd:process.cwd(),stdio:'pipe'});
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:fileFetch(out)});
  const changes=await api.research('science-changes');
  const observations=await api.research('science-observations');
  assert.ok(Array.isArray(changes.data.items));
  assert.ok(Array.isArray(observations.data.items));
  assert.ok(observations.data.items.some(item=>item.metricId==='cosmology.H0'));
});
