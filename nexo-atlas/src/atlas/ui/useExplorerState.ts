import {useEffect,useState} from 'react';
const PREFIX='nexo.public.explorer.v1.';
type Value=string|number|boolean;
/** Small UI preferences only, scoped to this browser tab; never stores research data. */
export function readExplorerValue<T extends Value>(key:string,fallback:T):T{
 try{const value=JSON.parse(sessionStorage.getItem(PREFIX+key)??'null');if(typeof value!==typeof fallback)return fallback;if(typeof value==='string'&&value.length>500)return fallback;if(typeof value==='number'&&(!Number.isInteger(value)||value<0||value>100000))return fallback;return value as T;}catch{return fallback;}
}
export function useExplorerState<T extends Value>(key:string,fallback:T,enabled=true){
 const [value,setValue]=useState<T>(()=>enabled?readExplorerValue(key,fallback):fallback);
 useEffect(()=>{if(!enabled)return;try{sessionStorage.setItem(PREFIX+key,JSON.stringify(value));}catch{}},[key,value,enabled]);
 return [value,setValue] as const;
}
