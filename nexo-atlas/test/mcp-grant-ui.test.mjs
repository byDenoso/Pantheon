import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMcpGrantTransport,parseMcpGrantStatus} from '../src/private-memory/mcpGrant.ts';
test('grant UI transport exposes only fixed same-origin status/create/revoke, never a generic fetch or custom body',async()=>{
 const calls=[];const read=createMcpGrantTransport(async(url,options)=>{calls.push({url,options});return Response.json({active:false});});
 await read('status');await read('create');await read('revoke');
 assert.deepEqual(calls.map(c=>c.url),Array(3).fill('/api/atlas-mcp/grant'));
 assert.deepEqual(calls.map(c=>c.options.method),['GET','POST','DELETE']);
 assert.deepEqual(JSON.parse(calls[1].options.body),{confirm:'owner-pin-readonly-30d-v1',days:30});
 for(const {options}of calls){assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,undefined);}
 await assert.rejects(()=>read('https://foreign.invalid'),/MCP_GRANT_ACTION_DENIED/);assert.equal(calls.length,3);
});
test('grant status rejects malformed response instead of enabling creation',()=>{
 const value={active:false,expiresAt:null,approvalEnabled:false,role:'LEARNER',scope:'tower-scientific-current-readonly-v13'};
 assert.deepEqual(parseMcpGrantStatus(value),value);
 for(const change of [{approvalEnabled:'true'},{role:'ENGINEER'},{scope:'all'},{active:true,expiresAt:null},{active:true,expiresAt:'invalid'}])assert.throws(()=>parseMcpGrantStatus({...value,...change}));
});
test('grant controls live only in guarded private source and consent never autosets',()=>{
 const ui=readFileSync('src/private-memory/McpGrantPanel.tsx','utf8');assert.match(ui,/useState\(false\)/);assert.match(ui,/if\(action==='create'&&\(!status\?\.approvalEnabled\|\|status.active\|\|!consent\)\)return/);
 assert.match(ui,/disabled=\{busy\|\|!status.approvalEnabled\|\|!consent\}/);assert.doesNotMatch(ui,/localStorage|sessionStorage|setConsent\(true\)/);
 assert.doesNotMatch(readFileSync('src/atlas/ui/PrivateApp.tsx','utf8'),/McpGrantPanel/);
});
