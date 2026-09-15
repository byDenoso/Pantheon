export function resolveAtlasV4Entry(href) {
  const url = new URL(href);
  const normalized = url.pathname.replace(/\/+$/, '') || '/';
  const segments = normalized.split('/').filter(Boolean);

  const isLocalRoot = normalized === '/';
  const isProjectRoot = segments.length === 1;
  const isAtlasV3 = segments.at(-1) === 'atlas-v3';

  if (isAtlasV3 || (!isLocalRoot && !isProjectRoot)) return null;

  const basePath = isLocalRoot ? '/' : `${normalized}/`;
  const target = new URL('atlas-v3/', `${url.origin}${basePath}`);
  target.search = url.search;
  target.hash = url.hash;
  return target.href;
}
