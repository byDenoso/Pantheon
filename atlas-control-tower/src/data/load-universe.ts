import {createApi} from '../../lib/atlas-api.mjs';
type GraphApi={graph:(query:Record<string,unknown>)=>Promise<any>};
const SYSTEMS:Record<string,string>={science:'SCIENCE',engineering:'ENGINEERING',olympus:'OLYMPUS',operations:'OPERATIONS'};
export async function loadUniverseSource(universeId:string,api:GraphApi=createApi() as GraphApi){const key=SYSTEMS[String(universeId||'').toLowerCase()];if(!key)return null;try{return await api.graph({focus:`system:${key}`,depth:1,limit:96})}catch{return null}}
