function normalizeBasePath(value='/'){
  const raw=String(value||'/').trim()||'/';
  const leading=raw.startsWith('/')?raw:`/${raw}`;
  return leading.endsWith('/')?leading:`${leading}/`;
}

export function resolveAtlasV4RootRedirect(locationLike,basePath='/'){
  const base=normalizeBasePath(basePath);
  const pathname=String(locationLike?.pathname||'/');
  const isRoot=pathname===base||pathname===base.slice(0,-1);
  if(!isRoot)return null;
  const search=String(locationLike?.search||'');
  const hash=String(locationLike?.hash||'');
  return `${base}atlas-v3/${search}${hash}`;
}
