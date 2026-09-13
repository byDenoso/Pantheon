const CONTRACT='NEXO_CANONICAL_GITHUB_V1';
const DEFAULT_URL='https://api.github.com/repos/byDenoso/Pantheon/contents/nexo-one/data/canonical.json?ref=main';
const text=value=>String(value??'').trim();
export function validateGithubAuthority(value){if(value?.contract!==CONTRACT||value?.authority!=='GITHUB')throw new Error('INVALID_GITHUB_AUTHORITY');return value}
export async function readGithubAuthority({fetcher=fetch,signal,url=process.env.NEXO_GITHUB_AUTHORITY_URL||DEFAULT_URL}={}){
 const response=await fetcher(url,{headers:{Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-atlas'},signal,cache:'no-store'});
 if(!response?.ok)throw new Error(`GITHUB_AUTHORITY_HTTP_${response?.status||0}`);
 return validateGithubAuthority(await response.json());
}
