const sessions = new Map();
const seenMessages = new Set();

const enc = new TextEncoder();

function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqualHex(a, b) {
  if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validMetaSignature(request, rawBody, env) {
  const secret = env.META_APP_SECRET;
  if (!secret) return true;
  const signature = request.headers.get('x-hub-signature-256');
  if (!signature?.startsWith('sha256=')) return false;
  const actual = signature.slice(7);
  if (actual.length !== 64) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return constantTimeEqualHex(actual, hex(signed));
}

function allowed(from, env) {
  const allow = (env.WHATSAPP_ALLOWED_NUMBERS || '').split(',').map(x => x.trim()).filter(Boolean);
  return env.WHATSAPP_ALLOW_ALL === 'true' || allow.includes(from);
}

async function askOpenAI(input, from, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente');
  const body = {
    model: env.OPENAI_MODEL || 'gpt-5.6-sol',
    instructions: env.SYSTEM_PROMPT || 'Responda em português do Brasil, de forma direta, útil e curta para WhatsApp.',
    input,
    max_output_tokens: Number(env.OPENAI_MAX_OUTPUT_TOKENS || 500),
  };
  const previous = sessions.get(from);
  if (previous) body.previous_response_id = previous;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  if (data.id) sessions.set(from, data.id);
  return data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || 'Sem resposta.';
}

async function sendWhatsApp(to, body, env) {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) throw new Error('Credenciais do WhatsApp ausentes');
  const version = env.META_GRAPH_VERSION || 'v23.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000) } }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}`);
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, service: 'whatsapp-openai-worker' });
  if (url.pathname !== '/webhook' && url.pathname !== '/api/webhook') return text('not found', 404);

  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) return text(challenge || '');
    return text('forbidden', 403);
  }

  if (request.method !== 'POST') return text('method not allowed', 405);
  const rawBody = await request.text();
  if (!(await validMetaSignature(request, rawBody, env))) return text('invalid signature', 401);

  let payload;
  try { payload = rawBody ? JSON.parse(rawBody) : {}; }
  catch { return text('invalid json', 400); }

  const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return json({ ok: true, ignored: true });
  if (msg.type !== 'text') return json({ ok: true, ignored: 'non-text' });
  const from = msg.from;
  if (!allowed(from, env)) return json({ ok: true, ignored: 'not-allowed' });
  if (msg.id && seenMessages.has(msg.id)) return json({ ok: true, ignored: 'duplicate' });

  try {
    const answer = await askOpenAI(msg.text?.body || '', from, env);
    await sendWhatsApp(from, answer, env);
    if (msg.id) {
      seenMessages.add(msg.id);
      if (seenMessages.size > 5000) seenMessages.delete(seenMessages.values().next().value);
    }
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: 'upstream_failure' }, 502);
  }
}

export default { fetch: handle };
