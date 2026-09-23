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

const validAtomicPublication={
  contract:'NEXO_PUBLIC_PROJECTION_PUBLICATION_V1',
  projection:validProjection,
  manifest:validManifest,
  build_meta:validBuildMeta,
};

test('projection sync prefers one atomic published Pages envelope',async()=>{
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
    if(href.includes('/tower-projection/publication.json')){
      return new Response(JSON.stringify(validAtomicPublication),{status:200,headers:{'content-type':'application/json'}});
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
    assert.equal(calls.length,1);
    assert.match(calls[0].href,/tower-projection\/publication\.json/);
    assert.equal(calls[0].init.cache,'no-store');
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
});

test('projection sync rejects an atomic envelope whose build-meta fingerprint diverges',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;

  globalThis.window={
    location:{origin:'https://bydenoso.github.io'},
    setTimeout:globalThis.setTimeout,
    clearTimeout:globalThis.clearTimeout,
  };
  globalThis.fetch=async(url)=>{
    const href=String(url);
    if(href.includes('publication.json'))return new Response(JSON.stringify({
      ...validAtomicPublication,
      build_meta:{...validBuildMeta,projection_fingerprint:'sha256:'+'f'.repeat(64)},
    }),{status:200});
    // Atomic contract mismatch intentionally falls through to compatibility
    // reads; keep those mismatched too so the overall result remains rejected.
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

test('projection sync falls back to validated trio while an older edge lacks atomic publication',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;
  const reads=new Map();

  globalThis.window={
    location:{origin:'https://bydenoso.github.io'},
    setTimeout(callback){queueMicrotask(callback);return 0;},
    clearTimeout(){},
  };
  globalThis.fetch=async(url)=>{
    const href=String(url);
    if(href.includes('publication.json'))return new Response('',{status:404});
    const asset=href.includes('projection.json')?'projection':href.includes('manifest.json')?'manifest':'build-meta';
    reads.set(asset,(reads.get(asset)||0)+1);
    if(asset==='projection')return new Response(JSON.stringify(validProjection),{status:200});
    if(asset==='manifest')return new Response(JSON.stringify(validManifest),{status:200});
    return new Response(JSON.stringify(validBuildMeta),{status:200});
  };

  try{
    const {dispatchProjectionSync}=await import('../src/data/projectionSync.ts');
    const receipt=await dispatchProjectionSync('sha256:'+'e'.repeat(64));
    assert.equal(receipt.outcome,'PUBLIC_PROJECTION_REFRESHED');
    assert.equal(receipt.projection_fingerprint,fingerprint);
    assert.deepEqual(Object.fromEntries(reads),{projection:1,manifest:1,'build-meta':1});
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
  assert.match(source,/tower-projection\/publication\.json/);
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
