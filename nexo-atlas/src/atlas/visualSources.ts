// A "source" that only points at the site's own front page tells the reader nothing
// about where a value came from. The catalog keeps such entries untouched (exports
// included); the interface simply does not present them as a citation link.
export function isSiteRootSource(url:string){
 try{const u=new URL(url);return u.pathname==='/'&&!u.search&&!u.hash&&(u.hostname==='nexoresearch.org'||u.hostname===globalThis.location?.hostname);}
 catch{return false;}
}
export const citableSources=<T extends {url:string}>(sources:readonly T[]):T[]=>sources.filter(source=>!isSiteRootSource(source.url));
