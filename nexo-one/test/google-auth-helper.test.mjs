import test from 'node:test';
import assert from 'node:assert/strict';
import {SCOPES,pkceChallenge,buildAuthorizationUrl,readOAuthCallback} from '../scripts/google-auth.mjs';

const expectedScopes=[
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
];

test('google auth helper requests only the required read-only scopes and PKCE',()=>{
  assert.deepEqual([...SCOPES].sort(),expectedScopes.sort());
  const challenge=pkceChallenge('abc');
  assert.equal(challenge,'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  const url=new URL(buildAuthorizationUrl({
    clientId:'client.apps.googleusercontent.com',
    redirectUri:'http://127.0.0.1:54321/callback',
    state:'state-123',
    codeChallenge:challenge
  }));
  assert.equal(`${url.origin}${url.pathname}`,'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'),'client.apps.googleusercontent.com');
  assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:54321/callback');
  assert.equal(url.searchParams.get('response_type'),'code');
  assert.equal(url.searchParams.get('access_type'),'offline');
  assert.equal(url.searchParams.get('prompt'),'consent');
  assert.equal(url.searchParams.get('include_granted_scopes'),'true');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('code_challenge'),challenge);
  assert.equal(url.searchParams.get('state'),'state-123');
  assert.equal(url.searchParams.get('scope'),SCOPES.join(' '));
});

test('OAuth callback fails closed instead of hanging on malformed callbacks',()=>{
  assert.equal(readOAuthCallback('/favicon.ico','state-123'),null);
  assert.equal(readOAuthCallback('/oauth2/callback?state=state-123&code=ok','state-123'),'ok');
  assert.throws(()=>readOAuthCallback('/oauth2/callback?state=wrong&code=ok','state-123'),/state mismatch/i);
  assert.throws(()=>readOAuthCallback('/oauth2/callback?state=state-123&error=access_denied','state-123'),/access_denied/);
  assert.throws(()=>readOAuthCallback('/oauth2/callback?state=state-123','state-123'),/Codigo OAuth ausente/);
});
