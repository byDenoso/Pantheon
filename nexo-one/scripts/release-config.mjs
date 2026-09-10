export function buildReleaseVercelConfig(sourceConfig,staticFiles=[]){
  const securityHeaders=Object.fromEntries((sourceConfig?.headers?.[0]?.headers||[]).map(v=>[v.key,v.value]));
  const explicitStatic=[...new Set(staticFiles)]
    .filter(src=>src==='index.html'||src.startsWith('assets/'));
  return {
    version:2,
    builds:[
      {src:'api/index.js',use:'@vercel/node'},
      ...explicitStatic.map(src=>({src,use:'@vercel/static'}))
    ],
    routes:[
      {src:'/(.*)',headers:securityHeaders,continue:true},
      {src:'/api/(.*)',dest:'/api/index.js?route=$1'},
      {handle:'filesystem'},
      {src:'/(.*)',dest:'/index.html'}
    ]
  };
}
