/** Query state belongs to the #/atlas route after the standalone URL bridge. */
export function atlasRouteParams():URLSearchParams{
  if(typeof window==='undefined')return new URLSearchParams();
  const route=window.location.hash.match(/^#\/?atlas\?(.+)$/i)?.[1];
  return route?new URLSearchParams(route):new URLSearchParams(window.location.search);
}

export function atlasRouteParam(name:string):string|null{
  return atlasRouteParams().get(name);
}
