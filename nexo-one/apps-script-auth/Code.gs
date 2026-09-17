var NEXO_SESSION_TTL_SECONDS=8*60*60;
var NEXO_RATE_WINDOW_SECONDS=15*60;
var NEXO_BROWSER_FAILURE_LIMIT=5;
var NEXO_GLOBAL_FAILURE_LIMIT=50;
var NEXO_PROTOCOL_VERSION=1;

function nexoProps_(){return PropertiesService.getScriptProperties();}
function nexoCache_(){return CacheService.getScriptCache();}
function nexoPublicState_(configured){return {configured:configured,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'};}
function nexoPrivateState_(){return {configured:true,authenticated:true,access:'PRIVATE',mode:'PRIVATE'};}
function nexoConfigured_(props){
  var hash=props.getProperty('NEXO_PIN_HASH')||'';
  var secret=props.getProperty('NEXO_SESSION_SECRET')||'';
  var origin=props.getProperty('NEXO_ALLOWED_ORIGIN')||'';
  return /^hmac-sha256\$[^$]+\$[a-f0-9]{64}$/.test(hash)&&secret.length>=32&&/^https:\/\/[^/]+$/.test(origin);
}
function nexoHex_(bytes){return bytes.map(function(value){var byte=value<0?value+256:value;return byte.toString(16).padStart(2,'0');}).join('');}
function nexoHmac_(value,secret){return nexoHex_(Utilities.computeHmacSha256Signature(String(value),String(secret),Utilities.Charset.UTF_8));}
function nexoConstantTimeEqual_(left,right){
  left=String(left||'');right=String(right||'');
  var length=Math.max(left.length,right.length),diff=left.length^right.length;
  for(var i=0;i<length;i++)diff|=(left.charCodeAt(i)||0)^(right.charCodeAt(i)||0);
  return diff===0;
}
function nexoValidPin_(pin){return /^\d{4,12}$/.test(String(pin||''));}
function nexoMakePinHash_(pin,salt,secret){return 'hmac-sha256$'+salt+'$'+nexoHmac_(salt+':'+pin,secret);}
function nexoVerifyPin_(pin,encoded,secret){
  if(!nexoValidPin_(pin)||!encoded||!secret)return false;
  var parts=String(encoded).split('$');
  if(parts.length!==3||parts[0]!=='hmac-sha256'||!parts[1]||!/^[a-f0-9]{64}$/.test(parts[2]))return false;
  return nexoConstantTimeEqual_(nexoHmac_(parts[1]+':'+pin,secret),parts[2]);
}
function nexoAllowedOrigin_(request,props){
  var expected=props.getProperty('NEXO_ALLOWED_ORIGIN')||'';
  return expected&&request&&String(request.origin||'')===expected;
}
function nexoSessionKey_(token,secret){return 'NEXO_SESSION_'+nexoHmac_('session:'+String(token||''),secret);}
function nexoBrowserKey_(browserId,secret){return 'rate:browser:'+nexoHmac_('browser:'+String(browserId||''),secret);}
function nexoReadJson_(cache,key){
  var raw=cache.get(key);if(!raw)return null;
  try{return JSON.parse(raw);}catch(_error){return null;}
}
function nexoBucketLimited_(bucket,now,max){return !!(bucket&&Number(bucket.windowStart)&&Number(bucket.count)>=max&&now<Number(bucket.windowStart)+NEXO_RATE_WINDOW_SECONDS*1000);}
function nexoIncrementBucket_(cache,key,now){
  var bucket=nexoReadJson_(cache,key);
  if(!bucket||!Number(bucket.windowStart)||now>=Number(bucket.windowStart)+NEXO_RATE_WINDOW_SECONDS*1000)bucket={windowStart:now,count:0};
  bucket.count=Number(bucket.count||0)+1;
  cache.put(key,JSON.stringify(bucket),NEXO_RATE_WINDOW_SECONDS);
  return bucket;
}
function nexoValidateSession_(token,props){
  if(!token)return null;
  var secret=props.getProperty('NEXO_SESSION_SECRET')||'';
  var key=nexoSessionKey_(token,secret);
  var raw=props.getProperty(key);
  if(!raw)return null;
  var record=null;
  try{record=JSON.parse(raw);}catch(_error){props.deleteProperty(key);return null;}
  var now=Date.now();
  if(!record||!Number(record.createdAt)||!Number(record.expiresAt)||now>=Number(record.expiresAt)||Number(record.expiresAt)-Number(record.createdAt)>NEXO_SESSION_TTL_SECONDS*1000){
    props.deleteProperty(key);
    return null;
  }
  return record;
}
function nexoIssueSession_(props){
  var secret=props.getProperty('NEXO_SESSION_SECRET');
  var entropy=Utilities.getUuid()+':'+Date.now()+':'+Utilities.getUuid();
  var token=nexoHmac_(entropy,secret);
  var now=Date.now();
  props.setProperty(nexoSessionKey_(token,secret),JSON.stringify({createdAt:now,expiresAt:now+NEXO_SESSION_TTL_SECONDS*1000}));
  return token;
}

function doGet(e){
  var props=nexoProps_();
  var allowedOrigin=props.getProperty('NEXO_ALLOWED_ORIGIN')||'';
  var requestedOrigin=e&&e.parameter?String(e.parameter.parentOrigin||''):'';
  var bridgeNonce=e&&e.parameter?String(e.parameter.bridgeNonce||''):'';
  if(requestedOrigin!==allowedOrigin||!/^[A-Za-z0-9._:-]{1,200}$/.test(bridgeNonce)){
    return HtmlService.createHtmlOutput('<!doctype html><title>NEXO Auth Bridge</title>Invalid bridge request.');
  }
  var template=HtmlService.createTemplateFromFile('Index');
  template.allowedOriginJson=JSON.stringify(allowedOrigin);
  template.bridgeNonceJson=JSON.stringify(bridgeNonce);
  return template.evaluate().setTitle('NEXO Auth Bridge').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function authStatus(request){
  var props=nexoProps_(),configured=nexoConfigured_(props);
  if(!nexoAllowedOrigin_(request,props))return {ok:false,status:403,state:nexoPublicState_(configured),error:'ORIGIN_NOT_ALLOWED'};
  if(!configured)return {ok:true,status:200,state:nexoPublicState_(false)};
  var token=String(request&&request.token||'');
  if(!token)return {ok:true,status:200,state:nexoPublicState_(true)};
  if(!nexoValidateSession_(token,props))return {ok:false,status:401,state:nexoPublicState_(true),error:'SESSION_EXPIRED'};
  return {ok:true,status:200,state:nexoPrivateState_()};
}

function authLogin(request){
  var props=nexoProps_(),configured=nexoConfigured_(props);
  if(!nexoAllowedOrigin_(request,props))return {ok:false,status:403,state:nexoPublicState_(configured),error:'ORIGIN_NOT_ALLOWED'};
  if(!configured)return {ok:false,status:503,state:nexoPublicState_(false),error:'AUTH_NOT_CONFIGURED'};
  var browserId=String(request&&request.browserId||'');
  var pin=String(request&&request.pin||'');
  if(!/^[A-Za-z0-9._:-]{8,200}$/.test(browserId)||!nexoValidPin_(pin))return {ok:false,status:401,state:nexoPublicState_(true),error:'AUTH_REQUIRED'};
  var cache=nexoCache_(),secret=props.getProperty('NEXO_SESSION_SECRET');
  var browserKey=nexoBrowserKey_(browserId,secret),globalKey='rate:global';
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return {ok:false,status:429,state:nexoPublicState_(true),error:'RATE_LIMITED'};
  try{
    var now=Date.now();
    if(nexoBucketLimited_(nexoReadJson_(cache,browserKey),now,NEXO_BROWSER_FAILURE_LIMIT)||nexoBucketLimited_(nexoReadJson_(cache,globalKey),now,NEXO_GLOBAL_FAILURE_LIMIT)){
      return {ok:false,status:429,state:nexoPublicState_(true),error:'RATE_LIMITED'};
    }
    if(!nexoVerifyPin_(pin,props.getProperty('NEXO_PIN_HASH'),secret)){
      nexoIncrementBucket_(cache,browserKey,now);
      nexoIncrementBucket_(cache,globalKey,now);
      return {ok:false,status:401,state:nexoPublicState_(true),error:'AUTH_REQUIRED'};
    }
    cache.remove(browserKey);
    var token=nexoIssueSession_(props);
    return {ok:true,status:200,state:nexoPrivateState_(),token:token};
  }finally{lock.releaseLock();}
}

function authLogout(request){
  var props=nexoProps_(),configured=nexoConfigured_(props);
  if(!nexoAllowedOrigin_(request,props))return {ok:false,status:403,state:nexoPublicState_(configured),error:'ORIGIN_NOT_ALLOWED'};
  if(configured&&request&&request.token){
    var secret=props.getProperty('NEXO_SESSION_SECRET');
    props.deleteProperty(nexoSessionKey_(String(request.token),secret));
  }
  return {ok:true,status:200,state:nexoPublicState_(configured)};
}

function setupNexoAuth(pin,allowedOrigin){
  pin=String(pin||'');allowedOrigin=String(allowedOrigin||'');
  if(!nexoValidPin_(pin))throw new Error('PIN must be numeric with 4-12 digits.');
  if(!/^https:\/\/[^/]+$/.test(allowedOrigin))throw new Error('Allowed origin must be an HTTPS origin without a path.');
  var secret=nexoHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,Utilities.getUuid()+':'+Utilities.getUuid()+':'+Date.now(),Utilities.Charset.UTF_8));
  var salt=Utilities.getUuid().replace(/-/g,'');
  nexoProps_().setProperties({
    NEXO_PIN_HASH:nexoMakePinHash_(pin,salt,secret),
    NEXO_SESSION_SECRET:secret,
    NEXO_ALLOWED_ORIGIN:allowedOrigin
  });
  return {ok:true,configured:true};
}
