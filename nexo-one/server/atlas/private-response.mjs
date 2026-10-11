import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
const compressGzip=promisify(gzip);
const MAX_WIRE_BYTES=4*1024*1024;
const MAX_JSON_BYTES=32*1024*1024;
function acceptsGzip(value){
  let explicit=null,wildcard=null;
  for(const part of String(value||'').split(',')){
    const [rawName,...parameters]=part.trim().toLowerCase().split(';'),name=rawName.trim();
    if(name!=='gzip'&&name!=='*')continue;
    let quality=1;
    if(parameters.length){
      if(parameters.length!==1||!/^\s*q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.test(parameters[0]))quality=0;
      else quality=Number(parameters[0].trim().slice(2));
    }
    // A specific exclusion overrides a wildcard. Duplicate exclusions also win
    // so a conflicting header never enables a representation the client denied.
    if(name==='gzip')explicit=explicit===null?quality:Math.min(explicit,quality);
    else wildcard=wildcard===null?quality:Math.min(wildcard,quality);
  }
  return (explicit??wildcard??0)>0;
}
// Send one complete canonical generation; never truncate private collections to
// fit a hosting limit. Content-Encoding is transparent to browser fetch().json().
export async function encodePrivateResponse(value,acceptEncoding=''){
  const raw=Buffer.from(JSON.stringify(value));
  if(raw.length>MAX_JSON_BYTES)throw new Error('PRIVATE_RESPONSE_TOO_LARGE');
  const compress=raw.length>=512*1024&&acceptsGzip(acceptEncoding);
  // Compression can be substantial for canonical snapshots. Keep that work off
  // the request thread so session verification and other requests stay responsive.
  const bytes=compress?await compressGzip(raw):raw;
  if(bytes.length>MAX_WIRE_BYTES)throw new Error('PRIVATE_RESPONSE_TOO_LARGE');
  return {bytes,encoding:compress?'gzip':null};
}
