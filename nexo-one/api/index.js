import handler from '../server/handler.mjs';
export default async function api(req,res) {
  const url=new URL(req.url,'https://local');
  const route=url.searchParams.get('route') || url.pathname.split('/').pop();
  if (route.startsWith('autonomy-')) {
    const {default: autonomy}=await import('../server/autonomy-handler.mjs');
    return autonomy(req,res);
  }
  return handler(req,res);
}
