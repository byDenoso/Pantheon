module.exports = async function vercelApiHandler(req, res) {
  const { default: handler } = await import('../nexo-one/server/handler.mjs');
  return handler(req, res);
};
