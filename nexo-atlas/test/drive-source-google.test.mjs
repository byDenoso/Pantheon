import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createHash, verify} from 'node:crypto';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';
import {readCanonicalDriveRevision, readCanonicalDriveTowerBytes} from '../worker/drive-source-google.mjs';

const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength:2048});
const env = {GOOGLE_SA_KEY:JSON.stringify({type:'service_account',client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})})};
const body = Buffer.from('{"test":true}');
function mock({change=false, mime='application/json', size=body.length, id=TOWER_ID, actual=body}={}) {
  let metadataCalls = 0;
  return async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const assertion = options.body.get('assertion');
      const [header,claims,signature] = assertion.split('.');
      assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature,'base64url')), true);
      assert.equal(JSON.parse(Buffer.from(claims,'base64url')).scope, 'https://www.googleapis.com/auth/drive.readonly');
      return Response.json({access_token:'synthetic',token_type:'Bearer'});
    }
    assert.equal(options.headers.authorization, 'Bearer synthetic');
    assert.equal(options.redirect, 'manual');
    if (url.endsWith('?alt=media')) return new Response(actual);
    assert.match(url, /fields=id%2CmimeType%2Csize%2CheadRevisionId$/);
    return Response.json({id,mimeType:mime,size:String(size),headRevisionId:change && metadataCalls++ ? 'rev2' : 'rev1'});
  };
}
test('reads fixed file with signed token, revision and digest', async () => {
  const result = await readCanonicalDriveTowerBytes(env, mock());
  assert.deepEqual(result.raw, body);
  assert.equal(result.transport.revision_id, 'rev1');
  assert.equal(result.transport.body_sha256, createHash('sha256').update(body).digest('hex'));
  assert.deepEqual(await readCanonicalDriveRevision(env, mock()), {id:'rev1',size:body.length});
});
for (const [name, options] of Object.entries({revision:{change:true},mime:{mime:'text/plain'},id:{id:'wrong'},large:{size:16*1024*1024+1},short:{actual:Buffer.from('{}')}})) {
  test(`fails closed on ${name}`, async () => assert.rejects(readCanonicalDriveTowerBytes(env, mock(options))));
}
test('rejects missing credentials', async () => assert.rejects(readCanonicalDriveRevision({}, mock()), /GOOGLE_SA_KEY_INVALID/));
