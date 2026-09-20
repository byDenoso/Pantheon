import {createSign} from 'node:crypto';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const DRIVE_API='https://www.googleapis.com/drive/v3';
const UPLOAD_API='https://www.googleapis.com/upload/drive/v3';
const SCOPE='https://www.googleapis.com/auth/drive';

function b64url(input){return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function parseServiceAccount(env=process.env){
  const raw=String(env.NEXO_DRIVE_SERVICE_ACCOUNT_JSON||'').trim();
  if(!raw)return null;
  let text=raw;
  if(!raw.startsWith('{')){try{text=Buffer.from(raw,'base64').toString('utf8');}catch{}}
  let value;try{value=JSON.parse(text);}catch{throw new Error('NEXO_DRIVE_SERVICE_ACCOUNT_JSON_INVALID');}
  if(!value?.client_email||!value?.private_key)throw new Error('NEXO_DRIVE_SERVICE_ACCOUNT_INCOMPLETE');
  return value;
}
function esc(value){return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
async function jsonResponse(response,label){
  const text=await response.text();let payload={};
  if(text){try{payload=JSON.parse(text);}catch{throw new Error(label+'_INVALID_JSON');}}
  if(!response.ok)throw new Error(label+'_HTTP_'+response.status+':'+(payload?.error?.message||payload?.error||'UNKNOWN'));
  return payload;
}

export function createDriveClient({env=process.env,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');
  const serviceAccount=parseServiceAccount(env);
  const rootId=String(env.NEXO_DRIVE_ROOT_ID||'').trim();
  const configured=Boolean(serviceAccount&&rootId);
  let cachedToken=null;

  async function accessToken(){
    if(!serviceAccount)throw new Error('DRIVE_SERVICE_ACCOUNT_NOT_CONFIGURED');
    if(cachedToken&&cachedToken.expiresAt>Date.now()+60000)return cachedToken.value;
    const now=Math.floor(Date.now()/1000);
    const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
    const claims=b64url(JSON.stringify({iss:serviceAccount.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600}));
    const unsigned=header+'.'+claims;
    const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
    const signature=signer.sign(serviceAccount.private_key).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const assertion=unsigned+'.'+signature;
    const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
    const response=await fetchImpl(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const payload=await jsonResponse(response,'DRIVE_TOKEN');
    cachedToken={value:payload.access_token,expiresAt:Date.now()+Number(payload.expires_in||3600)*1000};
    return cachedToken.value;
  }

  async function request(url,init={}){
    const token=await accessToken();
    return fetchImpl(url,{...init,headers:{Authorization:'Bearer '+token,...(init.headers||{})}});
  }

  async function listChildren(parentId,{name,mimeType}={}){
    const filters=["'"+esc(parentId)+"' in parents",'trashed = false'];
    if(name)filters.push("name = '"+esc(name)+"'");
    if(mimeType)filters.push("mimeType = '"+esc(mimeType)+"'");
    const params=new URLSearchParams({q:filters.join(' and '),fields:'files(id,name,mimeType,modifiedTime,size,md5Checksum)',pageSize:'1000',orderBy:'name'});
    return (await jsonResponse(await request(DRIVE_API+'/files?'+params),'DRIVE_LIST')).files||[];
  }
  async function getBuffer(fileId){
    const response=await request(DRIVE_API+'/files/'+encodeURIComponent(fileId)+'?alt=media');
    if(!response.ok)throw new Error('DRIVE_READ_HTTP_'+response.status);
    return Buffer.from(await response.arrayBuffer());
  }
  async function getJson(fileId){
    const bytes=await getBuffer(fileId);
    try{return JSON.parse(bytes.toString('utf8'));}catch{throw new Error('DRIVE_FILE_INVALID_JSON');}
  }
  async function findChild(parentId,name,{mimeType}={}){
    const files=await listChildren(parentId,{name,mimeType});
    if(files.length>1)throw new Error('DRIVE_DUPLICATE_NAME:'+name);
    return files[0]||null;
  }
  async function createFolder(parentId,name){
    const existing=await findChild(parentId,name,{mimeType:'application/vnd.google-apps.folder'});
    if(existing)return existing;
    return jsonResponse(await request(DRIVE_API+'/files?fields=id,name,mimeType',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})
    }),'DRIVE_CREATE_FOLDER');
  }
  async function createFile(parentId,name,content,{mimeType='application/octet-stream'}={}){
    const metadata=JSON.stringify({name,mimeType,parents:[parentId]});
    const response=await request(DRIVE_API+'/files?fields=id,name,mimeType,modifiedTime',{
      method:'POST',headers:{'Content-Type':'application/json'},body:metadata
    });
    const file=await jsonResponse(response,'DRIVE_CREATE_FILE_META');
    await updateFile(file.id,content,{mimeType});
    return file;
  }
  async function updateFile(fileId,content,{mimeType='application/octet-stream'}={}){
    const response=await request(UPLOAD_API+'/files/'+encodeURIComponent(fileId)+'?uploadType=media&fields=id,name,mimeType,modifiedTime',{
      method:'PATCH',headers:{'Content-Type':mimeType},body:content
    });
    return jsonResponse(response,'DRIVE_UPDATE_FILE');
  }
  async function createJson(parentId,name,value){return createFile(parentId,name,JSON.stringify(value,null,2)+'\n',{mimeType:'application/json'});}
  async function updateJson(fileId,value){return updateFile(fileId,JSON.stringify(value,null,2)+'\n',{mimeType:'application/json'});}

  const pathCache=new Map();
  async function resolveDirectory(relative='',opts={}){
    if(!configured)throw new Error('DRIVE_NOT_CONFIGURED');
    const clean=String(relative||'').replace(/^\/+|\/+$/g,'');
    if(!clean)return {id:rootId,name:'ROOT'};
    if(pathCache.has(clean))return pathCache.get(clean);
    let parent={id:rootId,name:'ROOT'},built='';
    for(const segment of clean.split('/').filter(Boolean)){
      built=built?built+'/'+segment:segment;
      if(pathCache.has(built)){parent=pathCache.get(built);continue;}
      let child=await findChild(parent.id,segment,{mimeType:'application/vnd.google-apps.folder'});
      if(!child&&opts.create)child=await createFolder(parent.id,segment);
      if(!child)return null;
      pathCache.set(built,child);parent=child;
    }
    return parent;
  }
  async function readPath(relative){
    const parts=String(relative).replace(/^\/+|\/+$/g,'').split('/'),name=parts.pop();
    const parent=await resolveDirectory(parts.join('/'));if(!parent)return null;
    const file=await findChild(parent.id,name);if(!file)return null;
    return {file,json:await getJson(file.id)};
  }
  async function listJsonDirectory(relative){
    const dir=await resolveDirectory(relative);if(!dir)return [];
    const files=(await listChildren(dir.id)).filter(f=>f.mimeType!=='application/vnd.google-apps.folder'&&f.name.endsWith('.json')).sort((a,b)=>a.name.localeCompare(b.name));
    const out=[];for(const file of files)out.push(await getJson(file.id));return out;
  }
  async function putFile(relative,content,{createParents=true,conflict='replace',mimeType='application/octet-stream'}={}){
    const parts=String(relative).replace(/^\/+|\/+$/g,'').split('/'),name=parts.pop();
    const parent=await resolveDirectory(parts.join('/'),{create:createParents});if(!parent)throw new Error('DRIVE_PARENT_MISSING');
    const existing=await findChild(parent.id,name);
    if(existing){
      if(conflict==='error')throw new Error('DRIVE_CONTENT_CONFLICT:'+relative);
      return {idempotent:false,file:await updateFile(existing.id,content,{mimeType})};
    }
    return {idempotent:false,file:await createFile(parent.id,name,content,{mimeType})};
  }
  async function putJson(relative,value,{createParents=true,conflict='replace'}={}){
    const parts=String(relative).replace(/^\/+|\/+$/g,'').split('/'),name=parts.pop();
    const parent=await resolveDirectory(parts.join('/'),{create:createParents});if(!parent)throw new Error('DRIVE_PARENT_MISSING');
    const existing=await findChild(parent.id,name);
    if(existing){
      if(conflict==='error')throw new Error('DRIVE_CONTENT_CONFLICT:'+relative);
      if(conflict==='idempotent'){const current=await getJson(existing.id);if(JSON.stringify(current)===JSON.stringify(value))return {idempotent:true,file:existing};throw new Error('DRIVE_CONTENT_CONFLICT:'+relative);}
      return {idempotent:false,file:await updateJson(existing.id,value)};
    }
    return {idempotent:false,file:await createJson(parent.id,name,value)};
  }
  return {configured,rootId,listChildren,getBuffer,getJson,findChild,createFolder,createFile,updateFile,resolveDirectory,readPath,listJsonDirectory,putFile,putJson};
}
