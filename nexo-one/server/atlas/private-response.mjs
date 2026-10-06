import {gzipSync} from 'node:zlib';
const MAX_WIRE_BYTES=4*1024*1024;
const MAX_JSON_BYTES=32*1024*1024;
function acceptsGzip(value){return String(value||'').split(',').some(part=>{const [name,...parameters]=part.trim().toLowerCase().split(';');if(name!=='gzip')return false;const q=parameters.find(value=>value.trim().startsWith('q='));return q===undefined||Number(q.trim().slice(2))>0;});}
// Send one complete canonical generation; never truncate private collections to
// fit a hosting limit. Content-Encoding is transparent to browser fetch().json().
export function encodePrivateResponse(value,acceptEncoding=''){
  const raw=Buffer.from(JSON.stringify(value));
  if(raw.length>MAX_JSON_BYTES)throw new Error('PRIVATE_RESPONSE_TOO_LARGE');
  const compress=raw.length>=512*1024&&acceptsGzip(acceptEncoding);
  const bytes=compress?gzipSync(raw):raw;
  if(bytes.length>MAX_WIRE_BYTES)throw new Error('PRIVATE_RESPONSE_TOO_LARGE');
  return {bytes,encoding:compress?'gzip':null};
}
