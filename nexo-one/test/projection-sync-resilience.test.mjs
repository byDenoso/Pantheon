import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const validProjection={
  contract:'NEXO_PUBLIC_PROJECTION_V1',
  counts:{active_work:115,needs_dener:2},
  manifest:{
    authority:'TOWER_V06',
    projection_only:true,
    writeback:'FORBIDDEN',
    projection_fingerprint:'sha256:'+'a'.repeat(64),
    generated_at:'2026-09-22T14:00:00Z',
    source_storage:'GOOGLE_DRIVE_PRIVATE',
    source_snapshot_id:'SNP-TEST',
    source_state_fingerprint:'sha256:'+'b'.repeat(64),
    truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',
  },
};

test('projection sync retries GitHub Raw and falls back to GitHub API without CORS-preflight headers',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;
  const calls=[];

  globalThis.window={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
  globalThis.fetch=async(url,init={})=>{
    const href=String(url);
    calls.push({href,init});
    if(href.startsWith('https://raw.githubusercontent.com/')){
      throw new TypeError('Failed to fetch');
    }
    if(href.startsWith('https://api.github.com/repos/byDenoso/NEXO-Obsidian-Vault/contents/')){
      return new Response(JSON.stringify(validProjection),{
        status:200,
        headers:{'content-type':'application/json'},
      });
    }
    throw new Error('unexpected fetch '+href);
  };

  try{
    const {dispatchProjectionSync}=await import('../src/data/projectionSync.ts');
    const receipt=await dispatchProjectionSync('sha256:'+'c'.repeat(64));
    assert.equal(receipt.outcome,'PUBLIC_PROJECTION_REFRESHED');
    assert.equal(receipt.origin_channel,'GITHUB_API_FALLBACK');
    assert.equal(receipt.active_work,115);

    const rawCalls=calls.filter(call=>call.href.startsWith('https://raw.githubusercontent.com/'));
    const apiCalls=calls.filter(call=>call.href.startsWith('https://api.github.com/'));
    assert.equal(rawCalls.length,3,'raw origin should be retried with bounded backoff');
    assert.equal(apiCalls.length,1,'GitHub API should be used after raw retries fail');
    for(const call of rawCalls){
      assert.equal(call.init.cache,'no-store');
      assert.equal(call.init.headers?.['Cache-Control'],undefined,'avoid non-safelisted header that can trigger CORS preflight');
      assert.equal(call.init.headers?.Accept,'application/json');
    }
    assert.equal(apiCalls[0].init.headers?.Accept,'application/vnd.github.raw+json');
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
});

test('projection sync source contains explicit upstream diagnostic instead of generic CORS blame',async()=>{
  const source=await readFile(new URL('../src/data/projectionSync.ts',import.meta.url),'utf8');
  assert.match(source,/HTTP 5xx sem headers CORS/);
  assert.match(source,/A origem GitHub da projeção está indisponível/);
  assert.match(source,/Fallback GitHub API/);
  assert.match(source,/RAW_RETRY_DELAYS_MS/);
});
