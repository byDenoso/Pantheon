import { createHmac, timingSafeEqual } from 'node:crypto';

const sessions = globalThis.__waSessions || new Map();
globalThis.__waSessions = sessions;
const seenMessages = globalThis.__waSeenMessages || new Set();
globalThis.__waSeenMessages = seenMessages;

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function validMetaSignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true;
  const signature = req.headers?.['x-hub-signature-256'] || req.headers?.['X-Hub-Signature-256'];
  if (!signature || !signature.startsWith('sha256=')) return false;
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = signature.slice(7);
  if (actual.length !== expected.length || !/^[0-9a-f]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function allowed(from) {
  const allow = (process.env.WHATSAPP_ALLOWED_NUMBERS || '').split(',').map(x => x.trim()).filter(Boolean);
  return process.env.WHATSAPP_ALLOW_ALL === 'true' || allow.includes(from);
}

async function askOpenAI(text, from) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  const previous = sessions.get(from);
  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
    instructions: process.env.SYSTEM_PROMPT || 'Responda em português do Brasil, de forma direta, útil e curta para WhatsApp.',
    input: text,
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 500)
  };
  if (previous) body.previous_response_id = previous;

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(data)}`);
  sessions.set(from, data.id);
  return data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || 'Sem resposta.';
}

async function sendWhatsApp(to, text) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) throw new Error('WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN ausente');
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4000) } })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send('forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('method not allowed');
  if (!validMetaSignature(req)) return res.status(401).send('invalid signature');

  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return json(res, 200, { ok: true, ignored: true });
    if (msg.type !== 'text') return json(res, 200, { ok: true, ignored: 'non-text' });
    const from = msg.from;
    if (!allowed(from)) return json(res, 200, { ok: true, ignored: 'not-allowed' });
    if (msg.id && seenMessages.has(msg.id)) return json(res, 200, { ok: true, ignored: 'duplicate' });

    const answer = await askOpenAI(msg.text?.body || '', from);
    await sendWhatsApp(from, answer);
    if (msg.id) {
      seenMessages.add(msg.id);
      if (seenMessages.size > 5000) seenMessages.delete(seenMessages.values().next().value);
    }
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(res, 502, { ok: false, error: 'upstream_failure' });
  }
}
