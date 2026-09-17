import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppsScriptAuthBridge,
  getStoredSessionToken,
  setStoredSessionToken,
  clearStoredSessionToken,
  TOKEN_STORAGE_KEY,
} from '../src/auth/apps-script-bridge.mjs';

function storage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    keys:()=>[...map.keys()],
    values:()=>[...map.values()],
  };
}

function fakeWindow(){
  const listeners=new Set();
  return {
    sessionStorage:storage(),
    localStorage:storage(),
    addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},
    removeEventListener:(type,fn)=>{if(type==='message')listeners.delete(fn);},
    dispatchMessage:event=>{for(const fn of listeners)fn(event);},
  };
}

function fixture(){
  const parent=fakeWindow();
  const sent=[];
  const iframeWindow={postMessage:(message,targetOrigin)=>sent.push({message,targetOrigin})};
  const bridge=createAppsScriptAuthBridge({
    bridgeUrl:'https://script.google.com/macros/s/example/exec',
    parentWindow:parent,
    iframeWindow,
    timeoutMs:100,
    randomId:()=> 'req-1',
  });
  return {parent,iframeWindow,sent,bridge};
}

test('session token helpers use sessionStorage only',()=>{
  const win=fakeWindow();
  setStoredSessionToken(win,'opaque-token');
  assert.equal(getStoredSessionToken(win),'opaque-token');
  assert.deepEqual(win.sessionStorage.keys(),[TOKEN_STORAGE_KEY]);
  assert.deepEqual(win.localStorage.keys(),[]);
  clearStoredSessionToken(win);
  assert.equal(getStoredSessionToken(win),null);
});

test('login never persists the PIN and stores only returned token',async()=>{
  const {parent,iframeWindow,sent,bridge}=fixture();
  const promise=bridge.login('123456');
  assert.equal(sent.length,1);
  assert.equal(sent[0].targetOrigin,'https://script.google.com');
  assert.equal(sent[0].message.type,'SESSION_LOGIN');
  assert.equal(sent[0].message.payload.pin,'123456');
  assert.deepEqual(parent.sessionStorage.values(),[]);
  assert.deepEqual(parent.localStorage.values(),[]);

  parent.dispatchMessage({
    origin:'https://script.google.com',
    source:iframeWindow,
    data:{source:'NEXO_AUTH_BRIDGE',version:1,requestId:'req-1',ok:true,status:200,token:'opaque-token',state:{configured:true,authenticated:true,access:'PRIVATE',mode:'PRIVATE'}},
  });
  const response=await promise;
  assert.equal(response.state.authenticated,true);
  assert.equal(getStoredSessionToken(parent),'opaque-token');
  assert.ok(!parent.sessionStorage.values().includes('123456'));
  assert.ok(!parent.localStorage.values().includes('123456'));
});

test('response must match exact origin, source, version and request id',async()=>{
  const {parent,iframeWindow,bridge}=fixture();
  const promise=bridge.getSession();
  const good={source:'NEXO_AUTH_BRIDGE',version:1,requestId:'req-1',ok:true,status:200,state:{configured:true,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'}};

  parent.dispatchMessage({origin:'https://evil.example',source:iframeWindow,data:good});
  parent.dispatchMessage({origin:'https://script.google.com',source:{},data:good});
  parent.dispatchMessage({origin:'https://script.google.com',source:iframeWindow,data:{...good,version:2}});
  parent.dispatchMessage({origin:'https://script.google.com',source:iframeWindow,data:{...good,requestId:'other'}});

  let settled=false;
  promise.then(()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(settled,false);

  parent.dispatchMessage({origin:'https://script.google.com',source:iframeWindow,data:good});
  assert.equal((await promise).status,200);
});

test('bridge request times out safely',async()=>{
  const {bridge}=fixture();
  await assert.rejects(()=>bridge.getSession(),/AUTH_BRIDGE_TIMEOUT/);
});
