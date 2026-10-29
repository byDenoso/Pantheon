import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {verifyGoogleOwner} from '../worker/google-identity.mjs';

const pair = generateKeyPairSync('rsa', {modulusLength:2048});
const other = generateKeyPairSync('rsa', {modulusLength:2048});
const jwk = {...pair.publicKey.export({format:'jwk'}), kid:'key', alg:'RS256', use:'sig'};
const env = {GOOGLE_CLIENT_ID:'client', NEXO_ATLAS_OWNER_SUB:'owner', NEXO_ATLAS_OWNER_EMAIL:'owner@example.invalid'};
const now = 1800000000000;
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
function token(changes={}, privateKey=pair.privateKey) {
  const h=encode({alg:'RS256',kid:'key'}), p=encode({iss:'https://accounts.google.com',aud:'client',sub:'owner',iat:now/1000,exp:now/1000+3600,email:'owner@example.invalid',email_verified:true,...changes});
  return `${h}.${p}.${sign('RSA-SHA256',Buffer.from(`${h}.${p}`),privateKey).toString('base64url')}`;
}
const fetcher = async url => { assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs'); return Response.json({keys:[jwk]}); };
test('accepts verified owner', async()=>assert.equal((await verifyGoogleOwner(token(),env,fetcher,now)).sub,'owner'));
test('rejects missing, forged, wrong owner, audience and expired tokens', async()=>{
  for (const t of ['',token({},other.privateKey),token({sub:'other'}),token({aud:'other'}),token({exp:now/1000})]) assert.equal(await verifyGoogleOwner(t,env,fetcher,now),null);
});
