import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {encodePrivateResponse} from '../server/atlas/private-response.mjs';
test('large private response stays complete with negotiated gzip instead of field truncation',()=>{const value={synthetic:'x'.repeat(5*1024*1024)};const result=encodePrivateResponse(value,'br, gzip');assert.equal(result.encoding,'gzip');assert.deepEqual(JSON.parse(gunzipSync(result.bytes)),value);assert.ok(result.bytes.length<4*1024*1024);});
test('identity and forbidden gzip never silently exceed platform response bound',()=>{const small={value:'synthetic'};assert.deepEqual(JSON.parse(encodePrivateResponse(small).bytes),small);for(const header of ['', 'br','gzip;q=0'])assert.throws(()=>encodePrivateResponse({value:'x'.repeat(5*1024*1024)},header),/PRIVATE_RESPONSE_TOO_LARGE/);});
