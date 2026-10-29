export const TOKEN_STORAGE_KEY='nexo.appsScript.sessionToken';
const PROTOCOL_VERSION=1;
const PARENT_SOURCE='NEXO_PARENT';
const BRIDGE_SOURCE='NEXO_AUTH_BRIDGE';

export function getStoredSessionToken(win=window){
  try{return win?.sessionStorage?.getItem(TOKEN_STORAGE_KEY)||null;}catch{return null;}
}

export function setStoredSessionToken(win=window,token){
  if(!token)return clearStoredSessionToken(win);
  try{win?.sessionStorage?.setItem(TOKEN_STORAGE_KEY,String(token));}catch{}
}

export function clearStoredSessionToken(win=window){
  try{win?.sessionStorage?.removeItem(TOKEN_STORAGE_KEY);}catch{}
}

function googleSandboxOrigin(origin){
  try{
    const url=new URL(origin);
    return url.protocol==='https:' && (url.hostname==='script.googleusercontent.com'||url.hostname.endsWith('.googleusercontent.com'));
  }catch{return false;}
}

function defaultRandomId(){
  const cryptoObject=globalThis.crypto;
  if(cryptoObject?.randomUUID)return cryptoObject.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createAppsScriptAuthBridge(options={}){
  const {
    bridgeUrl,
    parentWindow=globalThis.window,
    timeoutMs=5000,
    randomId=(kind)=>defaultRandomId(kind),
  }=options;
  if(!bridgeUrl)throw new Error('AUTH_BRIDGE_URL_REQUIRED');
  if(!parentWindow)throw new Error('AUTH_BRIDGE_WINDOW_REQUIRED');

  const nonce=String(randomId('nonce'));
  const browserId=`browser-${nonce}`;
  const iframe=new URL(bridgeUrl);
  iframe.searchParams.set('bridgeNonce',nonce);
  iframe.searchParams.set('parentOrigin',String(parentWindow.location?.origin||''));

  let bridgeSource=null;
  let bridgeOrigin=null;
  let disposed=false;
  const waiting=[];
  const pending=new Map();

  function rejectAll(error){
    for(const item of waiting.splice(0)){
      clearTimeout(item.timer);
      item.reject(error);
    }
    for(const item of pending.values()){
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }

  function send(item){
    if(disposed)return;
    if(!bridgeSource||!bridgeOrigin){waiting.push(item);return;}
    pending.set(item.requestId,item);
    bridgeSource.postMessage(item.message,bridgeOrigin);
  }

  function onMessage(event){
    const data=event?.data;
    if(!data||data.source!==BRIDGE_SOURCE||data.version!==PROTOCOL_VERSION)return;

    if(data.type==='BRIDGE_READY'){
      if(bridgeSource||disposed)return;
      if(data.nonce!==nonce||!googleSandboxOrigin(event.origin)||!event.source)return;
      bridgeSource=event.source;
      bridgeOrigin=event.origin;
      for(const item of waiting.splice(0))send(item);
      return;
    }

    if(!bridgeSource||event.source!==bridgeSource||event.origin!==bridgeOrigin)return;
    const item=pending.get(data.requestId);
    if(!item)return;
    pending.delete(data.requestId);
    clearTimeout(item.timer);

    if(data.error==='SESSION_EXPIRED')clearStoredSessionToken(parentWindow);
    if(data.ok&&data.token)setStoredSessionToken(parentWindow,data.token);
    item.resolve(data);
  }

  parentWindow.addEventListener('message',onMessage);

  function request(type,payload={}){
    if(disposed)return Promise.reject(new Error('AUTH_BRIDGE_DISPOSED'));
    const requestId=String(randomId('request'));
    const message={source:PARENT_SOURCE,version:PROTOCOL_VERSION,requestId,type,payload};
    return new Promise((resolve,reject)=>{
      const item={requestId,message,resolve,reject,timer:null};
      item.timer=setTimeout(()=>{
        const waitingIndex=waiting.indexOf(item);
        if(waitingIndex>=0)waiting.splice(waitingIndex,1);
        pending.delete(requestId);
        reject(new Error('AUTH_BRIDGE_TIMEOUT'));
      },timeoutMs);
      send(item);
    });
  }

  return {
    iframeUrl:iframe.toString(),
    getSession(){
      const token=getStoredSessionToken(parentWindow);
      return request('SESSION_GET',token?{token}:{});
    },
    login(pin){return request('SESSION_LOGIN',{pin:String(pin??''),browserId});},
    async logout(){
      const token=getStoredSessionToken(parentWindow);
      clearStoredSessionToken(parentWindow);
      return request('SESSION_LOGOUT',token?{token}:{});
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      parentWindow.removeEventListener('message',onMessage);
      rejectAll(new Error('AUTH_BRIDGE_DISPOSED'));
    },
  };
}
