import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAtlasSsotId} from '../server/adapters/atlas-ssot.mjs';

test('Atlas SSOT id comes from private environment configuration',()=>{
 assert.equal(resolveAtlasSsotId({DRIVE_SSOT_SPREADSHEET_ID:'sheet-private'}),'sheet-private');
 assert.throws(()=>resolveAtlasSsotId({}),/CONFIG_MISSING:DRIVE_SSOT_SPREADSHEET_ID/);
});
