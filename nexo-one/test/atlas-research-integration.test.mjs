import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
const vercel=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));

test('research API allows the current and legacy Atlas origins',()=>{assert.match(handler,/nexo-atlas-cockpit\.vercel\.app/);assert.match(handler,/nexo-atlas-control-tower\.vercel\.app/);assert.match(handler,/RESEARCH_ROUTES\.has\(route\).*Access-Control-Allow-Origin/s);});
test('friendly nested research API paths rewrite to stable route names',()=>{const pairs=vercel.rewrites.map(x=>`${x.source}->${x.destination}`);assert(pairs.includes('/api/atlas/graph->/api/index?route=atlas-graph'));assert(pairs.includes('/api/observatory/:view->/api/index?route=observatory-:view'));assert(pairs.includes('/api/lab/:view->/api/index?route=lab-:view'));assert(pairs.includes('/api/universe/snapshot->/api/index?route=universe-snapshot'));});
