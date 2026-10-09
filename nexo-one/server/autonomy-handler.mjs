import routes from './autonomy/routes.mjs';
export default async function autonomyHandler(req,res) {
  const url=new URL(req.url,'https://local');
  const route=url.searchParams.get('route') || url.pathname.split('/').pop();
  const result=await routes(route,req);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.statusCode=result.status; res.end(JSON.stringify(result.body));
}
