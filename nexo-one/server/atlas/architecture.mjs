// Cockpit projection of the 07/11/2026 NEXO architecture: Mural queues, achados scoreboard,
// DECISAO_DENER cards and manuscript state. Pure functions over the SHADOW board the cockpit
// already reads; nothing here is fetched, stored or invented.
// Manuscript state lives in the Tower tab MANUSCRITOS, never in this (public) repository.

export const QUEUES = Object.freeze(['HIPOTESE_PRE', 'PRIOR_ART_PRE', 'HIPOTESE_DUPLICADA', 'VARREDURA_REGISTRO', 'VARREDURA_RESULTADO', 'CANDIDATO_ABERTO', 'PEDIDO_AJUDA', 'PAPER_CANDIDATO', 'DECISAO_DENER']);
// Cards that must outlive the Mural window (300 rows is about half a day of traffic).
const RETAINED = new Set(['CANDIDATO_ABERTO', 'PAPER_CANDIDATO', 'DECISAO_DENER']);
// The scoreboard starts counting achados at the reformulation; earlier rows are another regime.
export const ARCH_SINCE = Date.parse('2026-11-07T00:00:00-03:00');
// Drive ID of ARQUIVO_MESTRE. Empty until the file is uploaded (its ID is "a preencher" in the file itself).
export const MASTER_FILE_ID = '';

/** ISO, "YYYY-MM-DD HH:MM[:SS] [America/Sao_Paulo]" and "DD/MM/YYYY HH:MM"; anything else is null. */
export function whenOf(value) {
  const v = String(value ?? '').trim().replace(/\s+America\/Sao_Paulo$/i, '');
  if (!v) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(v);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}T${br[4] ?? '00'}:${br[5] ?? '00'}:00-03:00` : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(v) ? `${v.replace(' ', 'T')}-03:00` : v;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
const queueOf = row => String(row?.tipo ?? '').trim().toUpperCase();
export const retainMuralRow = row => RETAINED.has(queueOf(row)) && (whenOf(row.data) ?? 0) >= ARCH_SINCE;

const iso = t => (t === null ? null : new Date(t).toISOString());
const keyOf = row => String(row.id || row.item || '').trim();
const cites = (row, id) => Boolean(id) && row.id !== id && [row.texto, row.item, row.id].some(cell => String(cell ?? '').includes(id));
const brief = (text, n) => { const v = String(text ?? '').replace(/\s+/g, ' ').trim(); return v.length > n ? `${v.slice(0, n - 1)}…` : v; };
const newestFirst = (a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity);

function manuscriptGroup(estado) {
  const v = String(estado ?? '').toLowerCase();
  if (/rejei|declin|retirad|desk/.test(v)) return 'rejeitado';
  if (/an[aá]lise|submetid|portal/.test(v)) return 'em_analise';
  if (/espera|abaixo do corte/.test(v)) return 'outro';
  if (/pront|candidato/.test(v)) return 'pronto';
  return 'outro';
}

export function architectureView(board, availability = {}, now = new Date()) {
  const muralOk = availability.mural === 'available' && Array.isArray(board?.mural);
  const rows = (muralOk ? board.mural : []).map(row => ({...row, queue: queueOf(row), t: whenOf(row.data)}));
  // The 300-row window starts at the oldest row that is not a retained older card.
  const windowFrom = rows.reduce((a, r) => (r.t !== null && !RETAINED.has(r.queue) ? Math.min(a, r.t) : a), Infinity);
  const inWindow = row => !RETAINED.has(row.queue) || windowFrom === Infinity || row.t === null || row.t >= windowFrom;
  const inQueue = q => rows.filter(row => row.queue === q).sort(newestFirst);

  const queues = QUEUES.map(queue => {
    const own = inQueue(queue);
    return {queue, count: own.length, last: iso(own[0]?.t ?? null)};
  });

  // A hypothesis is waiting when no prior-art or duplicate row cites its ID; a request is open when no later row cites it.
  const pendingHypotheses = inQueue('HIPOTESE_PRE').filter(h => keyOf(h) && !rows.some(r => (r.queue === 'PRIOR_ART_PRE' || r.queue === 'HIPOTESE_DUPLICADA') && cites(r, keyOf(h))));
  const openRequests = inQueue('PEDIDO_AJUDA').filter(p => keyOf(p) && !rows.some(r => (r.t ?? 0) >= (p.t ?? 0) && cites(r, keyOf(p))));
  const item = row => ({id: keyOf(row), task: row.de, at: iso(row.t), title: brief(row.item || row.texto, 140)});

  const since = rows.filter(r => r.t !== null && r.t >= ARCH_SINCE);
  const distinct = q => [...new Set(since.filter(r => r.queue === q).map(keyOf).filter(Boolean))];
  const g3 = distinct('CANDIDATO_ABERTO'), g5 = distinct('PAPER_CANDIDATO');
  const notFound = rows.filter(r => r.queue === 'PRIOR_ART_PRE' && /n[aã]o encontrei/i.test(r.texto));
  const g4 = g3.filter(id => notFound.some(r => cites(r, id)));

  const decisions = since.filter(r => r.queue === 'DECISAO_DENER').sort(newestFirst).slice(0, 20).map(r => ({
    id: keyOf(r), task: r.de, at: iso(r.t), title: brief(r.item, 160), text: brief(r.texto, 900), link: /^https:\/\//.test(r.link) ? r.link : '',
    mentions: rows.filter(o => (o.t ?? 0) > (r.t ?? 0) && cites(o, keyOf(r))).length,
  }));

  const available = availability.manuscritos === 'available';
  const ms = available && Array.isArray(board?.manuscritos) ? board.manuscritos : [];
  const manuscripts = {
    available,
    counts: ms.reduce((acc, row) => { const g = manuscriptGroup(row.estado); acc[g] = (acc[g] ?? 0) + 1; return acc; }, {}),
    rows: ms.map(({pacote, ...row}) => ({...row, group: manuscriptGroup(row.estado), needsDener: /dener/i.test(row.dono)})),
  };

  return {
    contract: 'NEXO_ARCHITECTURE_V1', generatedAt: now.toISOString(), available: muralOk,
    masterFile: MASTER_FILE_ID ? `https://drive.google.com/file/d/${MASTER_FILE_ID}/view` : null,
    windowFrom: windowFrom === Infinity ? null : iso(windowFrom), windowRows: rows.filter(inWindow).length,
    queues, pendingHypotheses: pendingHypotheses.slice(0, 10).map(item), openRequests: openRequests.slice(0, 10).map(item),
    // Achados are counted by queue (a candidate is what the Mural declares in CANDIDATO_ABERTO), never by grade words in free text.
    placar: {since: iso(ARCH_SINCE), g3: g3.length, g4: g4.length, g5: g5.length, tests: queues.find(q => q.queue === 'VARREDURA_RESULTADO')?.count ?? 0},
    decisions, manuscripts,
  };
}
