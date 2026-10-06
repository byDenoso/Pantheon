// Local mock of the authenticated private-ui backend contract (synthetic only; no real services).
import http from 'node:http';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.json': 'application/json'};

export function startBackend({privateDir, publicDir, runtime, sessionMs = 3_600_000}) {
  const manifest = JSON.parse(readFileSync(join(privateDir, 'manifest.json'), 'utf8'));
  const st = {authed: false, expiresAt: 0, privateStatus: 200, runtime, log: [], cookieOnly: true, deletes: 0, logins: 0, dropPrivate: false};
  const cookieOk = req => /(?:^|;\s*)atlas=ok/.test(req.headers.cookie ?? '');
  const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => { res.writeHead(status, {'content-type': type, 'cache-control': 'no-store', ...extra}); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    st.log.push(`${req.method} ${p}`);
    const live = () => st.authed && Date.now() < st.expiresAt && cookieOk(req);
    if (p === '/api/atlas-session') {
      if (req.method === 'GET') return send(res, 200, {configured: true, authenticated: live(), ...(live() ? {expiresAt: new Date(st.expiresAt).toISOString()} : {})});
      if (req.method === 'POST') { st.logins++; st.authed = true; st.expiresAt = Date.now() + sessionMs; return send(res, 200, {authenticated: true, expiresAt: new Date(st.expiresAt).toISOString()}, undefined, {'set-cookie': 'atlas=ok; Path=/; HttpOnly; SameSite=Strict'}); }
      if (req.method === 'DELETE') { st.deletes++; st.authed = false; return send(res, 200, {authenticated: false}, undefined, {'set-cookie': 'atlas=; Path=/; Max-Age=0; HttpOnly'}); }
    }
    if (p === '/api/atlas-private') {
      if (!live()) return send(res, 401, {error: 'AUTH_REQUIRED'});
      if (st.dropPrivate) return req.socket.destroy(); // simulates a pure network failure
      if (st.privateStatus !== 200) return send(res, st.privateStatus, {error: 'PRIVATE_SOURCE_UNAVAILABLE'});
      return send(res, 200, {contract: 'ATLAS_PRIVATE_V1', data: st.runtime});
    }
    if (p === '/api/atlas-private-ui') { if (!live()) return send(res, 401, {error: 'AUTH_REQUIRED'}); return send(res, 200, readFileSync(join(privateDir, 'index.html')), TYPES['.html']); }
    if (p.startsWith('/api/atlas-private-assets/')) {
      if (!live()) return send(res, 401, {error: 'AUTH_REQUIRED'});
      const rel = normalize(decodeURIComponent(p.slice('/api/atlas-private-assets/'.length))).replace(/^(\.\.[/\\])+/, '');
      const want = manifest.files[rel]; const f = join(privateDir, rel);
      if (!want || !existsSync(f)) return send(res, 404, {error: 'NOT_FOUND'});
      const buf = readFileSync(f); if (createHash('sha256').update(buf).digest('hex') !== want) return send(res, 503, {error: 'PRIVATE_UI_UNAVAILABLE'});
      return send(res, 200, buf, TYPES[extname(f)] ?? 'application/octet-stream');
    }
    if (p === '/api/atlas-public') return send(res, 200, {contract: 'ATLAS_PUBLIC_V1', items: [], links: []});
    if (p === '/api/atlas-locale') return send(res, 200, {contract: 'ATLAS_LOCALE_V1', locale: 'pt-BR', source: 'default', supported: ['pt-BR', 'en']});
    if (p.startsWith('/api/')) return send(res, 404, {error: 'NOT_FOUND'});
    let f = join(publicDir, p === '/' ? 'index.html' : p);
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(publicDir, 'index.html');
    return send(res, 200, readFileSync(f), TYPES[extname(f)] ?? 'application/octet-stream');
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({st, server, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(c => server.close(c))})));
}
