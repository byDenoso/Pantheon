const CONTRACT='NEXO_ATLAS_AUTHORITY_V2';
const DEFAULT_URL='https://api.github.com/repos/byDenoso/Pantheon/contents/nexo-one/data/canonical.json?ref=main';
export function validateGithubAuthority(value){
 if(value?.contract!==CONTRACT)throw new Error('INVALID_ATLAS_AUTHORITY_CONTRACT');
 if(value?.authority!=='TOWER_V06')throw new Error('INVALID_ATLAS_AUTHORITY');
 if(value?.truthOwner!=='byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06')throw new Error('INVALID_TOWER_TRUTH_OWNER');
 if(value?.repository!=='byDenoso/NEXO-Obsidian-Vault'||!value?.controlPath)throw new Error('INVALID_TOWER_LOCATOR');
 if(value?.projection?.role!=='READ_ONLY_PROJECTION')throw new Error('INVALID_ATLAS_PROJECTION_ROLE');
 return value;
}
export async function readGithubAuthority({fetcher=fetch,signal,url=process.env.NEXO_GITHUB_AUTHORITY_URL||DEFAULT_URL}={}){
 const response=await fetcher(url,{headers:{Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'nexo-atlas'},signal,cache:'no-store'});
 if(!response?.ok)throw new Error(`ATLAS_AUTHORITY_HTTP_${response?.status||0}`);
 return validateGithubAuthority(await response.json());
}
