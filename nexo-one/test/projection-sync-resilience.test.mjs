import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const fingerprint='sha256:'+'a'.repeat(64);
const stateFingerprint='sha256:'+'b'.repeat(64);
const generatedAt='2026-09-22T14:00:00Z';

const validManifest={
  authority:'TOWER_V06',
  projection_only:true,
  writeback:'FORBIDDEN',
  projection_fingerprint:fingerprint,
  generated_at:generatedAt,
  source_storage:'GOOGLE_DRIVE_PRIVATE',
  source_snapshot_id:'SNP-TEST',
  source_state_fingerprint:stateFingerprint,
  truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',
};

const validProjection={
  contract:'NEXO_PUBLIC_PROJECTION_V1',
  counts:{active_work:115,needs_dener:2},
  manifest:validManifest,
};

const validBuildMeta={
  contract:'NEXO_ONE_BUILD_META_V1',
  pantheon_commit:'c'.repeat(40),
  projection_fingerprint:fingerprint,
  sync_request_id:'',
  built_at:'2026-09-22T14:01:00Z',
};

test('projection sync fallback reads only the published Pages snapshot and validates its evidence trio',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;
  const calls=[];

  globalThis.window={
    location:{origin:'https://bydenoso.github.io'},
    setTimeout:globalThis.setTimeout,
    clearTimeout:globalThis.clearTimeout,
  };
  globalThis.fetch=async(url,init={})=>{
    const href=String(url);
    calls.push({href,init});
    if(href.includes('/Pantheon/tower-projection/projection.json')||href.includes('/tower-projection/projection.json')){
      return new Response(JSON.stringify(validProjection),{status:200,headers:{'content-type':'application/json'}});
    }
    if(href.includes('/Pantheon/tower-projection/manifest.json')||href.includes('/tower-projection/manifest.json')){
      return new Response(JSON.stringify(validManifest),{status:200,headers:{'content-type':'application/json'}});
    }
    if(href.includes('/Pantheon/build-meta.json')||href.includes('/build-meta.json')){
      return new Response(JSON.stringify(validBuildMeta),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error('unexpected fetch '+href);
  };

  try{
    const {dispatchProjectionSync}=await import('../src/data/projectionSync.ts');
    const receipt=await dispatchProjectionSync('sha256:'+'d'.repeat(64));
    assert.equal(receipt.outcome,'PUBLIC_PROJECTION_REFRESHED');
    assert.equal(receipt.origin_channel,'GITHUB_PAGES_VALIDATED');
    assert.equal(receipt.active_work,115);
    assert.equal(receipt.projection_fingerprint,fingerprint);
    assert.equal(calls.length,3);
    assert.ok(calls.every(call=>!call.href.includes('NEXO-Obsidian-Vault')),
      'browser fallback must never read the private export mirror directly');
    assert.ok(calls.every(call=>call.init.cache==='no-store'));
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
});

test('projection sync rejects a published snapshot whose build-meta fingerprint diverges',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;

  globalThis.window={
    location:{origin:'https://bydenoso.github.io'},
    setTimeout:globalThis.setTimeout,
    clearTimeout:globalThis.clearTimeout,
  };
  globalThis.fetch=async(url)=>{
    const href=String(url);
    if(href.includes('projection.json'))return new Response(JSON.stringify(validProjection),{status:200});
    if(href.includes('manifest.json'))return new Response(JSON.stringify(validManifest),{status:200});
    if(href.includes('build-meta.json'))return new Response(JSON.stringify({...validBuildMeta,projection_fingerprint:'sha256:'+'f'.repeat(64)}),{status:200});
    throw new Error('unexpected fetch '+href);
  };

  try{
    const {dispatchProjectionSync}=await import('../src/data/projectionSync.ts');
    await assert.rejects(
      dispatchProjectionSync('sha256:'+'d'.repeat(64)),
      error=>error?.code==='CONTRACT_MISMATCH'&&/não fecharam o mesmo fingerprint/.test(error.message),
    );
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
});

test('projection sync re-reads the full published evidence set when CDN edges serve mixed generations',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;
  const reads=new Map();
  const previousFingerprint='sha256:'+'e'.repeat(64);
  const currentFingerprint='sha256:'+'d'.repeat(64);
  const currentManifest={...validManifest,projection_fingerprint:currentFingerprint};
  const currentProjection={...validProjection,manifest:currentManifest};
  const currentBuildMeta={...validBuildMeta,projection_fingerprint:currentFingerprint};

  globalThis.window={
    location:{origin:'https://bydenoso.github.io'},
    setTimeout(callback){queueMicrotask(callback);return 0;},
    clearTimeout(){},
  };
  globalThis.fetch=async(url)=>{
    const href=String(url);
    const asset=href.includes('projection.json')?'projection':href.includes('manifest.json')?'manifest':'build-meta';
    const count=(reads.get(asset)||0)+1;
    reads.set(asset,count);
    // First read simulates an edge that has the new projection but stale
    // manifest/build-meta. The next complete read is internally consistent.
    if(asset==='projection')return new Response(JSON.stringify(currentProjection),{status:200});
    if(asset==='manifest')return new Response(JSON.stringify(count===1?validManifest:currentManifest),{status:200});
    return new Response(JSON.stringify(count===1?validBuildMeta:currentBuildMeta),{status:200});
  };

  try{
    const {dispatchProjectionSync}=await import('../src/data/projectionSync.ts');
    const receipt=await dispatchProjectionSync(previousFingerprint);
    assert.equal(receipt.outcome,'PUBLIC_PROJECTION_REFRESHED');
    assert.equal(receipt.projection_fingerprint,currentFingerprint);
    assert.deepEqual(Object.fromEntries(reads),{projection:2,manifest:2,'build-meta':2});
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
});

test('projection sync source contains no browser path to the private Git export mirror',async()=>{
  const source=await readFile(new URL('../src/data/projectionSync.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/raw\.githubusercontent\.com/);
  assert.doesNotMatch(source,/api\.github\.com\/repos\/byDenoso\/NEXO-Obsidian-Vault/);
  assert.match(source,/tower-projection\/projection\.json/);
  assert.match(source,/tower-projection\/manifest\.json/);
  assert.match(source,/build-meta\.json/);
  assert.match(source,/GITHUB_PAGES_VALIDATED/);
  assert.match(source,/SYNC_BRIDGE_NOT_CONFIGURED/);
  assert.match(source,/return fetchFreshPublicProjection\(signal\)/);
  assert.match(source,/PUBLIC_PROJECTION_CACHED/);
  assert.match(source,/GITHUB_PAGES_VALIDATED_CACHE/);
  assert.match(source,/VALIDATED_CACHE_MAX_AGE_MS = 30 \* 60 \* 1000/);
  assert.match(source,/status===404/);
  assert.match(source,/\[0, 800, 2400, 6000\]/);
});
