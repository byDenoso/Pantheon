import http from 'node:http';
import { URL } from 'node:url';
import handler from './api/webhook.js';

function responseAdapter(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    setHeader(name, value) { res.setHeader(name, value); return this; },
    send(body) { res.end(String(body)); return this; },
    end(body = '') { res.end(body); return this; }
  };
}

const server = http.createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url || '/', 'http://localhost');
  if (url.pathname === '/health') {
    outgoing.setHeader('content-type', 'application/json');
    outgoing.end(JSON.stringify({ ok: true, service: 'whatsapp-openai-render-bridge' }));
    return;
  }
  if (url.pathname !== '/webhook' && url.pathname !== '/api/webhook') {
    outgoing.statusCode = 404;
    outgoing.end('not found');
    return;
  }

  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);
  let body;
  if (rawBody.length > 0) {
    try { body = JSON.parse(rawBody.toString('utf8')); }
    catch { outgoing.statusCode = 400; outgoing.end('invalid json'); return; }
  }

  const req = {
    method: incoming.method,
    headers: incoming.headers,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    rawBody: rawBody.toString('utf8')
  };

  try { await handler(req, responseAdapter(outgoing)); }
  catch (error) {
    console.error(error);
    if (!outgoing.writableEnded) { outgoing.statusCode = 500; outgoing.end('internal error'); }
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`WhatsApp gateway listening on ${port}`));
