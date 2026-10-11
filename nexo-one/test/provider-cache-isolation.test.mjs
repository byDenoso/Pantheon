import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readProvider,clearProviderCache} from '../server/adapters/registry.mjs';
import {item} from '../server/adapters/http.mjs';

const now=Date.parse('2026-10-11T12:00:00Z');
const snapshot=(title)=>({items:[item('github',title,title,'https://github.com/example/repository',now)]});
beforeEach(clearProviderCache);

test('provider cache and concurrent reads are isolated by source and private credential scope',async()=>{
  for(const scopes of [
    [{access:'PUBLIC',env:{GITHUB_REPOSITORY:'example/one'}},{access:'PUBLIC',env:{GITHUB_REPOSITORY:'example/two'}}],
    [{access:'PRIVATE',env:{GITHUB_TOKEN:'synthetic-one'}},{access:'PRIVATE',env:{GITHUB_TOKEN:'synthetic-two'}}],
    [{access:'PRIVATE',env:{GOOGLE_CONNECTOR:'google',GOOGLE_CONNECT_SUBJECT_ID:'owner-one'}},{access:'PRIVATE',env:{GOOGLE_CONNECTOR:'google',GOOGLE_CONNECT_SUBJECT_ID:'owner-two'}}]
  ]){
    clearProviderCache();
    let reads=0;
    const reader=async({env})=>{reads++;await Promise.resolve();return snapshot(env.GITHUB_REPOSITORY||env.GITHUB_TOKEN||env.GOOGLE_CONNECT_SUBJECT_ID);};
    const [one,two]=await Promise.all(scopes.map(scope=>readProvider('github',{...scope,now,reader})));
    assert.equal(reads,2);
    assert.notEqual(one.items[0].title,two.items[0].title);
    const cached=await readProvider('github',{...scopes[1],now:now+1000,reader});
    assert.equal(cached.items[0].title,two.items[0].title);
    assert.equal(reads,2);
  }
});

test('clearing provider cache cannot let an old in-flight read replace a newer result',async()=>{
  let releaseOld,releaseNew,reads=0;
  const reader=()=>new Promise(resolve=>{reads++;if(reads===1)releaseOld=()=>resolve(snapshot('old'));else releaseNew=()=>resolve(snapshot('new'));});
  const old=readProvider('github',{now,reader});
  clearProviderCache();
  const fresh=readProvider('github',{now,reader});
  releaseOld();
  await old;
  const concurrent=readProvider('github',{now,reader});
  releaseNew();
  assert.equal((await fresh).items[0].title,'new');
  assert.equal((await concurrent).items[0].title,'new');
  assert.equal(reads,2);
  assert.equal((await readProvider('github',{now,reader})).items[0].title,'new');
});
