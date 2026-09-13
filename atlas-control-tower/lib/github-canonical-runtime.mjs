import {createHash} from 'node:crypto';
import {readGithubAuthority} from './github-authority.mjs';
const TTL=30000;let cache=null;
const arr=value=>Array.isArray(value)?value:[];
const hash=value=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const KEYS=['science','engineering','olympus','learning','crossDomain','integrity','actions'];
function validatePayload(payload,authority){
 if(!payload||typeof payload!=='object')throw new Error('INVALID_GITHUB_CANONICAL_PAYLOAD');
 const expected=authority?.projection?.fingerprint,actual=payload?.meta?.fingerprint;
 if(expected&&actual!==expected)throw new Error('GITHUB_CANONICAL_FINGERPRINT_MISMATCH');
 return payload;
}
async function fetchPayload(authority,{fetcher=fetch,signal}={}){
 const repo=authority.repository||'byDenoso/Pantheon',ref=authority.ref||'main',path=authority?.projection?.transportPath;
 if(!path)throw new Error('GITHUB_CANONICAL_PATH_MISSING');
 const url=`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
 const response=await fetcher(url,{headers:{Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-atlas'},signal,cache:'no-store'});
 if(!response?.ok)throw new Error(`GITHUB_CANONICAL_PAYLOAD_HTTP_${response?.status||0}`);
 return validatePayload(await response.json(),authority);
}
export async function loadGithubCanonical({force=false,fetcher=fetch,signal}={}){
 if(!force&&cache&&Date.now()-cache.at<TTL)return cache;
 const authority=await readGithubAuthority({fetcher,signal}),payload=await fetchPayload(authority,{fetcher,signal});
 cache={at:Date.now(),authority,payload,fingerprint:payload.meta?.fingerprint||hash(payload)};return cache;
}
export function lastGithubCanonical(){return cache}
function diff(before,after){
 if(!before)return {outcome:'REFRESHED',fingerprintBefore:null,fingerprintAfter:after.fingerprint,changedProjections:KEYS,detailAvailable:false};
 if(before.fingerprint===after.fingerprint)return {outcome:'NO_CHANGE',fingerprintBefore:before.fingerprint,fingerprintAfter:after.fingerprint,changedProjections:[],detailAvailable:true};
 const changedProjections=KEYS.filter(key=>hash(arr(before.payload?.[key]))!==hash(arr(after.payload?.[key])));
 return {outcome:'UPDATED',fingerprintBefore:before.fingerprint,fingerprintAfter:after.fingerprint,changedProjections,detailAvailable:true};
}
export async function syncGithubCanonical(options={}){const before=cache,after=await loadGithubCanonical({...options,force:true});return {state:after,diff:diff(before,after)}}
