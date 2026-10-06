export function buildReleaseVercelConfig(sourceConfig,staticFiles=[]){
  const securityHeaders=Object.fromEntries((sourceConfig?.headers?.[0]?.headers||[]).map(v=>[v.key,v.value]));
  const explicitStatic=[...new Set(staticFiles)]
    .filter(src=>src==='index.html'||src.startsWith('assets/')||
      ['google-drive-connect.html','google-drive-connect.js','google-drive-connect.css'].includes(src));
  return {
    version:2,
    builds:[
      {src:'api/index.js',use:'@vercel/node',config:{includeFiles:['server/private-ui/**']}},
      ...explicitStatic.map(src=>({src,use:'@vercel/static'}))
    ],
    routes:[
      {src:'/(.*)',headers:securityHeaders,continue:true},
      {src:'/api/atlas-private-assets/(.*)',dest:'/api/index.js?route=atlas-private-asset&asset=$1'},
      {src:'/api/(.*)',dest:'/api/index.js?route=$1'},
      {handle:'filesystem'},
      {src:'/(.*)',dest:'/index.html'}
    ]
  };
}
