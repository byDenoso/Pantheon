import {readFile} from 'node:fs/promises';

const projectionUrls = [
  new URL('../../data/nexo-drive-projection.json', import.meta.url),
  new URL('../../../atlas-control-tower/data/nexo-drive-projection.json', import.meta.url),
];
const text = value => String(value ?? '').trim();
const upper = value => text(value).toUpperCase();
const domainOf = value => {
  const v = upper(value);
  if (v.includes('OLYMPUS')) return 'OLYMPUS';
  if (v.includes('ENGINEERING') || v.includes('TI')) return 'ENGINEERING';
  if (v.includes('SCIENCE') || v.includes('COSMO') || v.includes('PEER')) return 'SCIENCE';
  return 'NEXO';
};
const domains = value => text(value).split(/[|;,]/).map(domainOf).filter(Boolean);

export async function readPublicSystemInput({url} = {}) {
  let source;
  for (const candidate of (url ? [url] : projectionUrls)) {
    try { source = JSON.parse(await readFile(candidate, 'utf8')); break; } catch { /* próxima projeção local */ }
  }
  if (!source) return emptyInput();
  const actions = (source.actions || []).map(row => ({
    action_id: text(row.id), domain: domainOf(`${row.title} ${row.summary}`), action: text(row.title),
    status: upper(row.status).includes('COMPLETE') || upper(row.status).includes('VERIFIED') ? 'DONE' : 'OPEN',
    authority: 'DERIVED', last_checked: text(row.updatedAt), next_action: text(row.summary),
    evidence_pointer: text(row.provenance) || 'PUBLIC_PROJECTION', fingerprint: text(row.id),
  })).filter(row => row.action_id);
  const sideQuests = actions.filter(row => row.status === 'OPEN').map(row => ({
    side_quest_id: `PUBLIC-REVIEW-${row.action_id}`, parent_action_id: row.action_id, lane: row.domain,
    type: 'HUMAN', status: 'WAITING', blocker: row.action, required_resolution: 'Revisar o sinal projetado e confirmar o próximo passo.',
    blocks_scope: row.domain, created_at: row.last_checked, source_ref: 'PUBLIC_PROJECTION', fingerprint: row.fingerprint,
  }));
  const learning = [...(source.learning || []), ...(source.crossDomain || [])];
  const learningFilaments = learning.map(row => {
    const id = text(row.id);
    const pair = domains(row.domains);
    const sourceDomain = pair[0] || domainOf(row.domain);
    const targetDomain = pair[1] || sourceDomain;
    return {
      filament_id: id, source_layer: 'SEMANTIC_MEMORY', source_id: `${id}:source`, source_domain: sourceDomain,
      target_layer: 'PROCEDURAL_MEMORY', target_id: `${id}:target`, target_domain: targetDomain,
      source_label: `${text(row.title) || id} · ${sourceDomain}`,
      target_label: `${text(row.title) || id} · ${targetDomain}`,
      filament_type: text(row.title) || 'Learning filament', activation_rule: text(row.rule),
      weight: row.confidence ?? 0.5, support_count: row.support ?? 0, contradiction_count: row.contradict ?? 0,
      status: upper(row.status).includes('RETIR') ? 'RETIRED' : upper(row.status).includes('CONTEST') ? 'CONTESTED' : 'ACTIVE',
      evidence_refs: text(row.provenance), next_discriminant: text(row.scope),
    };
  }).filter(row => row.filament_id);
  return {actions, executionRuns: [], sideQuests, capabilities: [], semanticMemory: source.learning || [], proceduralMemory: [], learningFilaments, automationHealth: []};
}

function emptyInput() { return {actions: [], executionRuns: [], sideQuests: [], capabilities: [], semanticMemory: [], proceduralMemory: [], learningFilaments: [], automationHealth: []}; }
