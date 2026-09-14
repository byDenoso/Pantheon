import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAtlasSsotId,selectAtlasSsotFile} from '../server/adapters/atlas-ssot.mjs';

test('explicit SSOT id can come from private environment configuration',()=>{
 assert.equal(resolveAtlasSsotId({DRIVE_SSOT_SPREADSHEET_ID:'sheet-private'}),'sheet-private');
 assert.equal(resolveAtlasSsotId({}),null);
});

test('Drive discovery requires exactly one exact-name spreadsheet',()=>{
 const files=[{id:'sheet-1',name:'DENER · SSOT CANONICAL'}];
 assert.equal(selectAtlasSsotFile(files,'DENER · SSOT CANONICAL').id,'sheet-1');
 assert.throws(()=>selectAtlasSsotFile([], 'DENER · SSOT CANONICAL'),/SSOT_DISCOVERY_NOT_FOUND/);
 assert.throws(()=>selectAtlasSsotFile([{id:'a',name:'DENER · SSOT CANONICAL'},{id:'b',name:'DENER · SSOT CANONICAL'}], 'DENER · SSOT CANONICAL'),/SSOT_DISCOVERY_AMBIGUOUS/);
});
