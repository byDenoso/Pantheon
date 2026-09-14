import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const handlerSource=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
const vercelSource=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));

test('NEXO One mounts MCP before the global GET-only guard',()=>{
  assert.match(handlerSource,/createNexoMcpWebHandler/);
  assert.match(handlerSource,/toNodeHandler/);
  const mcpIndex=handlerSource.indexOf("route==='mcp'");
  const getOnlyIndex=handlerSource.indexOf("req.method!=='GET'");
  assert(mcpIndex>=0,'missing MCP route dispatch');
  assert(getOnlyIndex>=0,'missing global GET-only guard');
  assert(mcpIndex<getOnlyIndex,'MCP POST must dispatch before the GET-only guard');
});

test('Vercel keeps MCP inside the existing single api/index.js function',()=>{
  assert.deepEqual(Object.keys(vercelSource.functions),['api/index.js']);
  assert(vercelSource.rewrites.some(rule=>rule.source==='/api/:route'&&rule.destination.includes('route=:route')));
});
