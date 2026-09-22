const CONTRACT='NEXO_ATLAS_AUTHORITY_V2';
const DEFAULT_URL='https://api.github.com/repos/byDenoso/Pantheon/contents/nexo-one/data/canonical.json?ref=main';
const RETRY_DELAYS_MS=[0,800,2400,6000];
const sleepDefault=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const retryable=status=>status===404||status===408||status===425||status===429||status===500||status===502||status===503||status===504;

function rawAlternative(url){
 try{
  const parsed=new URL(url);
  if(parsed.hostname!=='api.github.com')return null;
  const match=parsed.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
  if(!match)return null;
  const ref=parsed.searchParams.get('ref')||'main';
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${encodeURIComponent(ref)}/${match[3]}`;
 }catch{return null;}
}

export function validateGithubAuthority(value){
 if(value?.contract!==CONTRACT)throw new Error('INVALID_ATLAS_AUTHORITY_CONTRACT');
 if(value?.authority!=='TOWER_V06')throw new Error('INVALID_ATLAS_AUTHORITY');
 if(value?.truthOwner!=='byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06')throw new Error('INVALID_TOWER_TRUTH_OWNER');
 if(value?.repository!=='byDenoso/NEXO-Obsidian-Vault'||!value?.controlPath)throw new Error('INVALID_TOWER_LOCATOR');
 if(value?.projection?.role!=='READ_ONLY_PROJECTION')throw new Error('INVALID_ATLAS_PROJECTION_ROLE');
 if(String(value?.projection?.kind||'').includes('LEGACY_GOOGLE_DRIVE'))throw new Error('ATLAS_LEGACY_DRIVE_PROJECTION_RETIRED');
 return value;
}

async function requestJson(fetcher,url,signal){
 const response=await fetcher(url,{headers:{Accept:url.includes('raw.githubusercontent.com')?'application/json':'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-atlas'},signal,cache:'no-store'});
 if(!response?.ok)return {ok:false,status:response?.status||0,value:null};
 try{return {ok:true,status:response.status,value:await response.json()};}
 catch{return {ok:false,status:response.status,value:null};}
}

export async function readGithubAuthority({fetcher=fetch,signal,url=process.env.NEXO_GITHUB_AUTHORITY_URL||DEFAULT_URL,sleep=sleepDefault}={}){
 let lastStatus=0;
 const raw=rawAlternative(url);
 for(let attempt=0;attempt<RETRY_DELAYS_MS.length;attempt+=1){
  const delay=RETRY_DELAYS_MS[attempt];
  if(delay)await sleep(delay);
  const primary=await requestJson(fetcher,url,signal);
  if(primary.ok)return validateGithubAuthority(primary.value);
  lastStatus=primary.status;
  if(raw){
   const fallback=await requestJson(fetcher,raw,signal);
   if(fallback.ok)return validateGithubAuthority(fallback.value);
   lastStatus=fallback.status||lastStatus;
  }
  if(!retryable(lastStatus))break;
 }
 throw new Error(`ATLAS_AUTHORITY_HTTP_${lastStatus}`);
}

export const _internal={rawAlternative,retryable,RETRY_DELAYS_MS};
