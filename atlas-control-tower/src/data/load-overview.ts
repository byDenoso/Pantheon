type FetchLike=(input:string)=>Promise<{ok:boolean;status:number;json:()=>Promise<unknown>}>;

type OverviewSourceSet={state:unknown|null;ops:unknown|null;audit:unknown|null};

async function read(fetchImpl:FetchLike,url:string){
  try{
    const response=await fetchImpl(url);
    if(!response.ok) return null;
    return await response.json();
  }catch{
    return null;
  }
}

export async function loadOverviewSources(fetchImpl:FetchLike=fetch as unknown as FetchLike):Promise<OverviewSourceSet>{
  const [state,ops,audit]=await Promise.all([
    read(fetchImpl,'/api/state'),
    read(fetchImpl,'/api/ops'),
    read(fetchImpl,'/api/audit'),
  ]);
  return {state,ops,audit};
}
