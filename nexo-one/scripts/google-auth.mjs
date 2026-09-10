import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const SCOPES=Object.freeze([
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
]);

const AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL='https://oauth2.googleapis.com/token';

function base64url(value){return Buffer.from(value).toString('base64url');}
export function pkceChallenge(verifier){return base64url(createHash('sha256').update(verifier).digest());}
export function buildAuthorizationUrl({clientId,redirectUri,state,codeChallenge}){
  const url=new URL(AUTH_URL);
  url.search=new URLSearchParams({
    client_id:clientId,
    redirect_uri:redirectUri,
    response_type:'code',
    scope:SCOPES.join(' '),
    access_type:'offline',
    prompt:'consent',
    include_granted_scopes:'true',
    code_challenge:codeChallenge,
    code_challenge_method:'S256',
    state
  }).toString();
  return url.toString();
}

function callbackServer(expectedState){
  let settle;
  const code=new Promise((resolveCode,rejectCode)=>{settle={resolveCode,rejectCode};});
  const server=createServer((req,res)=>{
    const requestUrl=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
    if(requestUrl.pathname!=='/oauth2/callback'){
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;
    }
    const state=requestUrl.searchParams.get('state');
    const error=requestUrl.searchParams.get('error');
    const authCode=requestUrl.searchParams.get('code');
    if(state!==expectedState){
      res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Estado OAuth invalido. Feche esta aba.');
      settle.rejectCode(new Error('OAuth state mismatch.'));server.close();return;
    }
    if(error){
      res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Autorizacao recusada. Feche esta aba.');
      settle.rejectCode(new Error(`Google OAuth error: ${error}`));server.close();return;
    }
    if(!authCode){
      res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Codigo OAuth ausente. Feche esta aba.');return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end('<!doctype html><meta charset="utf-8"><title>NEXO ONE</title><body style="font-family:system-ui;padding:40px"><h1>Autorizacao recebida</h1><p>Volte ao terminal. Esta aba pode ser fechada.</p></body>');
    settle.resolveCode(authCode);server.close();
  });
  return {server,code};
}

async function listen(server){
  await new Promise((resolveListen,rejectListen)=>{
    server.once('error',rejectListen);
    server.listen(0,'127.0.0.1',()=>{server.off('error',rejectListen);resolveListen();});
  });
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Nao foi possivel abrir o callback local.');
  return `http://127.0.0.1:${address.port}/oauth2/callback`;
}

async function exchangeCode({clientId,clientSecret,redirectUri,code,verifier}){
  const response=await fetch(TOKEN_URL,{
    method:'POST',
    signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:clientId,
      client_secret:clientSecret,
      code,
      code_verifier:verifier,
      grant_type:'authorization_code',
      redirect_uri:redirectUri
    })
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`Falha ao trocar o codigo OAuth (${response.status}): ${payload.error_description||payload.error||'erro desconhecido'}`);
  if(!payload.refresh_token)throw new Error('Google nao retornou refresh_token. Remova o acesso anterior do app na conta Google e execute novamente.');
  return payload.refresh_token;
}

export async function main(env=process.env){
  const clientId=env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret=env.GOOGLE_CLIENT_SECRET?.trim();
  if(!clientId||!clientSecret)throw new Error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente antes de executar.');

  const verifier=base64url(randomBytes(48));
  const state=base64url(randomBytes(24));
  const {server,code}=callbackServer(state);
  const redirectUri=await listen(server);
  const authorizeUrl=buildAuthorizationUrl({clientId,redirectUri,state,codeChallenge:pkceChallenge(verifier)});

  console.log('\nAbra esta URL no navegador e autorize a conta Google que o NEXO ONE deve ler:\n');
  console.log(authorizeUrl);
  console.log(`\nCallback local: ${redirectUri}`);
  console.log('Escopos: Drive leitura, Gmail leitura e Calendar leitura. Nenhuma escrita.\n');

  try{
    const authorizationCode=await code;
    const refreshToken=await exchangeCode({clientId,clientSecret,redirectUri,code:authorizationCode,verifier});
    console.log('\nGOOGLE_REFRESH_TOKEN=');
    console.log(refreshToken);
    console.log('\nCole esse valor diretamente nas Environment Variables do projeto NEXO ONE na Vercel. Nao salve em arquivo nem envie por chat.');
  }finally{
    if(server.listening)server.close();
  }
}

const invoked=process.argv[1]?pathToFileURL(resolve(process.argv[1])).href:null;
if(invoked===import.meta.url){
  main().catch(error=>{console.error(`\n${error.message}`);process.exitCode=1;});
}
