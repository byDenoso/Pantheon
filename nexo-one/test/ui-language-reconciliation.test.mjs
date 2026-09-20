import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('NEXO ONE and MCP Atlas share product navigation and operational language',async()=>{
  const [nav,overview,app,mcp,css]=await Promise.all([
    text('src/app/navigation.ts'),
    text('src/features/system/Overview.tsx'),
    text('src/app/App.tsx'),
    text('src/mcp/McpAtlasApp.tsx'),
    text('src/mcp/mcp-atlas.css'),
  ]);
  assert.doesNotMatch(nav,/O estado real, agora|O que merece sua atenção|Encontre\. Retome\. Avance/);
  assert.match(nav,/Estado operacional da Tower/);
  assert.match(overview,/0 itens em Needs Dener/);
  assert.match(app,/MCP Atlas/);
  assert.match(app,/BASE_URL}mcp\//);
  assert.match(mcp,/Topologia MCP/);
  assert.match(mcp,/TOWER_V06 · MCP STRUCTURE/);
  assert.match(mcp,/mcp-bottom-nav/);
  assert.match(css,/--surface-0:#05070b/);
  assert.match(css,/--accent:#79e7ff/);
});
