module.exports = async function vercelApiHandler(req, res) {
  const url = new URL(req.url, 'http://local');
  const route = url.searchParams.get('route') || url.pathname.replace(/\/+$/, '').split('/').pop();
  if (process.env.NEXO_ATLAS_V67_ENABLED === '1') {
    const routes = new Set(['auth/google','auth/google/callback','auth/logout','atlas-access','atlas-session','atlas-pin/setup','atlas-private','atlas-private/test','atlas-private-ui']);
    const path = route === 'atlas-private-asset' ? '/api/atlas-private-assets/' + (url.searchParams.get('asset') || '') : routes.has(route) ? '/api/' + route : null;
    if (path) {
      const {default: handler} = await import('../nexo-atlas/server/vercel-handler.mjs');
      return handler(req,res,path);
    }
  }
  if (route.startsWith('autonomy-')) {
    const { default: autonomy } = await import('../nexo-one/server/autonomy-handler.mjs');
    return autonomy(req, res);
  }
  if (route === 'atlas-operations' || route === 'atlas-operations-ui') {
    const { default: operations } = await import('../nexo-one/server/operations-handler.mjs');
    return operations(req, res);
  }
  const { default: handler } = await import('../nexo-one/server/handler.mjs');
  return handler(req, res);
};
