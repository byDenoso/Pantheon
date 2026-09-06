import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../lib/atlas-api.mjs';
const reply=body=>({ok:true,status:200,json:async()=>body});

test('first graph after sync carries refresh=1 to bypass CDN then returns to stable URL',async()=>{
 const urls=[];
 const api=createApi({fetchImpl:async(url)=>{urls.push(String(url));return reply(url.includes('/sync?')?{fingerprint:'fp2'}:{nodes:[],edges:[],fingerprint:'fp2',source:'v1',freshness:'LIVE',summary:{total:0}})}});
 await api.sync();
 await api.graph({focus:'system:NEXO'});
 api.clear();
 await api.graph({focus:'system:NEXO'});
 const graphUrls=urls.filter(u=>u.includes('/api/graph?'));
 assert.equal(graphUrls.length,2);
 assert.match(graphUrls[0],/refresh=1/);
 assert.doesNotMatch(graphUrls[1],/refresh=1/);
});