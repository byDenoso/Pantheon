import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/atlas.js';

function res(){
 const headers={};
 return {headers,statusCode:200,body:'',setHeader(k,v){headers[k]=v},end(v=''){this.body=v}};
}

test('GET graph returns summary in the same response and uses short Vercel CDN caching', async()=>{
 const r=res();
 await handler({method:'GET',url:'/api/graph?focus=system%3ANEXO',headers:{host:'atlas.local'}},r);
 assert.equal(r.statusCode,200);
 const body=JSON.parse(r.body);
 assert.ok(body.summary && typeof body.summary.total==='number');
 assert.equal(r.headers['Cache-Control'],'private, no-store');
 assert.match(r.headers['Vercel-CDN-Cache-Control'],/max-age=30/);
});

test('POST sync is never CDN cached', async()=>{
 const r=res();
 await handler({method:'POST',url:'/api/sync',headers:{host:'atlas.local'}},r);
 assert.equal(r.headers['Vercel-CDN-Cache-Control'],undefined);
 assert.equal(r.headers['Cache-Control'],'private, no-store');
});
