/** Presentation naming. Canonical identifiers never change: this layer only
 *  decides what a human reads first. Every derived label is traceable through
 *  `displaySource`, and no abbreviation is decoded into a concept the data does
 *  not already contain. */

export const DISPLAY_SOURCES = Object.freeze({
 CURATED:'CURATED_LABEL',
 BACKEND:'BACKEND_LABEL',
 CAMPAIGN:'CAMPAIGN_DERIVED',
 QUESTION:'SCIENTIFIC_TITLE',
 ID:'CANONICAL_ID',
 ID_HUMANIZED:'CANONICAL_ID_HUMANIZED'
});

/** Registry namespaces are addressing, not vocabulary. */
const NAMESPACE = new Set(['PEER', 'T', 'DH', 'H']);

/** Only tokens whose expansion is already vocabulary in the projection.
 *  Anything absent here is title-cased, never decoded. */
const GLOSSARY = Object.freeze({
 MICRO:'Microphysics', CMB:'CMB', LSS:'LSS', BAO:'BAO', SNE:'SNe', AGN:'AGN',
 SMBH:'SMBH', WL:'Weak lensing', PNG:'PNG', EFT:'EFT', CROSS:'Cross-probe'
});

/** Operational records are addressed by their code in practice; their summary is
 *  an outcome paragraph, never a title. */
const OPERATIONAL = new Set(['RUN', 'AUTOMATION_RUN', 'RESULT', 'FILE', 'ARTIFACT', 'DATASET']);

export const canonicalId = node => String(node?.id || '').replace(/^[a-z_]+:/, '');

/** A structured registry code, as opposed to a name that merely matches the id. */
const looksLikeCode = s => {const parts = s.split(/[-_]/); return parts.length > 1 && (NAMESPACE.has(parts[0].toUpperCase()) || /[0-9]/.test(s));};

const isIdLike = (label, node) => {
 const l = String(label || '').trim();
 if (!l) return true;
 if (l === node.id) return true;
 return l === canonicalId(node) && looksLikeCode(l);
};

/** Deterministic tidy-up of an identifier. Unknown tokens keep their own text. */
export function humanizeId(raw) {
 const id = String(raw || '').trim();
 if (!id) return '';
 const parts = id.split(/[-_]/).filter(Boolean);
 if (parts.length < 2) return id;
 let head = parts;
 while (head.length > 1 && NAMESPACE.has(head[0].toUpperCase())) head = head.slice(1);
 const tail = head.at(-1);
 const ordinal = /^\d+$/.test(tail) ? tail : '';
 const words = (ordinal ? head.slice(0, -1) : head)
  .map(token => GLOSSARY[token.toUpperCase()] || (/^[A-Z0-9]+$/.test(token)
   ? token.charAt(0) + token.slice(1).toLowerCase()
   : token));
 const text = words.join(' ').trim();
 return ordinal ? `${text} · ${ordinal}` : text;
}

/** Humanising helps a short code and hurts a long one full of dates. */
export function worthHumanizing(raw) {
 const meaningful = String(raw || '').split(/[-_]/).filter(Boolean).filter(t => !NAMESPACE.has(t.toUpperCase()));
 return meaningful.length > 0 && meaningful.length <= 4 && !meaningful.some(t => /^\d{6,}$/.test(t));
}

/** Deterministic tidy-up of a SHOUTED source label. Mixed-case text is left alone. */
export function tidySourceLabel(text) {
 return String(text || '').split('·').map(part => {
  const seg = part.trim();
  const shouted = /^[A-Z0-9][A-Z0-9 _-]*$/.test(seg) && seg.split(/[\s_-]+/).length > 1;
  return shouted ? humanizeId(seg.replace(/\s+/g, '-')) : seg;
 }).filter(Boolean).join(' · ');
}

/** First sentence or clause of a scientific question, kept short but unedited. */
function shortTitle(summary) {
 const text = String(summary || '').trim();
 if (!text) return '';
 const clause = text.split(/(?<=[.?])\s|\s[—–]\s/)[0].trim();
 return clause.length > 96 ? clause.slice(0, 93).trimEnd() + '…' : clause;
}

/**
 * @param node   projection node
 * @param campaignLabel  name of a campaign that explicitly contains this node, if any
 * @returns {{label:string,canonicalId:string,canonicalTitle:string,displaySource:string,searchText:string}}
 */
export function displayName(node, {campaignLabel = ''} = {}) {
 const meta = node?.metadata || {};
 const canonical = canonicalId(node);
 const curated = meta.curated_label || meta.display_label || node?.curatedLabel;
 const backend = meta.display_name || node?.displayName || (isIdLike(node?.label, node) ? '' : node?.label);
 const question = shortTitle(node?.summary || meta['Test / Question'] || meta.scientific_question);
 let label = '', displaySource = '';
 if (curated) {
  label = String(curated); displaySource = DISPLAY_SOURCES.CURATED;
 } else if (backend) {
  label = tidySourceLabel(backend); displaySource = DISPLAY_SOURCES.BACKEND;
 } else if (campaignLabel && canonical) {
  const ordinal = (canonical.match(/(\d+)$/) || [])[1];
  const base = tidySourceLabel(campaignLabel);
  label = ordinal ? `${base} · ${ordinal}` : base;
  displaySource = DISPLAY_SOURCES.CAMPAIGN;
 } else if (question && !OPERATIONAL.has(node?.type)) {
  label = question; displaySource = DISPLAY_SOURCES.QUESTION;
 } else if (worthHumanizing(canonical)) {
  // Humanising a long, date-bearing identifier makes it worse: keep the canonical form.
  label = humanizeId(canonical); displaySource = DISPLAY_SOURCES.ID_HUMANIZED;
 } else {
  label = canonical; displaySource = DISPLAY_SOURCES.ID;
 }
 return {
  label,
  canonicalId: canonical,
  canonicalTitle: String(node?.label ?? canonical),
  displaySource,
  // Search must reach the label, the canonical ID, the scientific question and the campaign.
  searchText: [label, canonical, node?.id, question, campaignLabel].filter(Boolean).join(' ')
 };
}

/** Decorates a whole projection once. Canonical fields are preserved, never replaced. */
export function decorateGraph(graph) {
 const campaignOf = new Map();
 for (const e of graph.edges || []) {
  if (e.type !== 'CONTAINS' || !String(e.source).startsWith('campaign:')) continue;
  if (!campaignOf.has(e.target)) campaignOf.set(e.target, e.source);
 }
 const labelOf = new Map((graph.nodes || []).map(n => [n.id, n.label]));
 const nodes = (graph.nodes || []).map(node => {
  const campaignId = campaignOf.get(node.id);
  const naming = displayName(node, {campaignLabel: campaignId ? String(labelOf.get(campaignId) || '') : ''});
  return {...node, ...naming};
 });
 return {...graph, nodes};
}
