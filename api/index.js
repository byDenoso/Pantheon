module.exports = async function vercelApiHandler(req, res) {
  const url = new URL(req.url, 'http://local');
  const route = url.searchParams.get('route') || url.pathname.replace(/\/+$/, '').split('/').pop();
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
