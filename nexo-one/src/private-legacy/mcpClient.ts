// Swapped in for mcp/client.ts. Read-only query panel over the ONE authenticated runtime generation, labelled
// PRIVATE and local-snapshot. It is NOT a live MCP server: no network, no machine/Writer access, no telemetry,
// no server health. Each query uses declared source records only; unsupported
// observations, program definitions and generation comparisons stay unavailable.
import type {McpTool, McpStatus} from '../mcp/client.ts';
import type {PrivateRuntime} from './runtime.ts';
import {runtimeHolder} from './state.ts';

export type {ToolSchema, McpTool, McpCall, McpStatus} from '../mcp/client.ts';
export const MCP_ENDPOINT = 'local://snapshot-privado';

type Args = Record<string, unknown>;
type Def = {
  name: string; description: string; inputSchema: McpTool['inputSchema'];
  /** null = available; otherwise the exact reason it is not */
  unavailable: (rt: PrivateRuntime) => string | null;
  run: (rt: PrivateRuntime, args: Args) => Record<string, unknown>;
};

const str = {type: 'string', maxLength: 512};
const lim = (max: number) => ({type: 'integer', minimum: 1, maximum: max});
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const bounded = (v: unknown, def: number, max: number) => Math.max(1, Math.min(typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : def, max));

type Node = {id: string} & Record<string, unknown>;
function nodes(rt: PrivateRuntime): Node[] {
  const seen = new Set<string>(); const out: Node[] = [];
  for (const n of [...arr<Node>(rt.system.graph?.nodes), ...arr<Node>(rt.system.projected_work)]) {
    const id = text(n?.id); if (!id || seen.has(id)) continue; seen.add(id); out.push(n);
  }
  return out;
}
const science = (rt: PrivateRuntime) => (rt.system.science_projection_v1 ?? null) as null | {source?: unknown; campaigns?: unknown; hypotheses?: unknown; tests?: unknown; historical_tests?: unknown};
const nodeView = (n: Node) => ({id: n.id, kind: nul(n.type), label: nul(n.label), domain: nul(n.domain), state: nul(n.state), summary: nul(n.summary),
  operational_status: nul(n.operational_status), source_ref: nul(n.source_ref), source_revision: nul(n.source_revision), fingerprint: nul(n.fingerprint)});

const meta = (rt: PrivateRuntime) => ({authority: null, sourceVersion: rt.source_revision, fingerprint: rt.fingerprint, projectionFingerprint: rt.fingerprint,
  freshness: 'SNAPSHOT', generatedAt: rt.generated_at, lastReadAt: null, access: 'PRIVATE', scope: 'LOCAL_SNAPSHOT'});

// Evidence wrappers are not arbitrary objects with a `value` property: a
// quantitative result is itself a map whose `value` is another evidence field.
const unwrap = (value: unknown): unknown => {
  const row = rec(value);
  return Object.hasOwn(row, 'value') && Object.hasOwn(row, 'unavailable_reason') && typeof row.source_ref === 'string' && typeof row.fingerprint === 'string' && !['id', 'observation_id', 'metric_id', 'metricId', 'kind'].some(key => Object.hasOwn(row, key)) ? row.value : value;
};
const field = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) { const value = unwrap(row[key]); if (value !== null && value !== undefined) return value; }
  return null;
};
const hasDeclaredValue = (value: unknown): boolean => {
  const raw = unwrap(value);
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'number') return Number.isFinite(raw);
  if (typeof raw === 'boolean') return true;
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return raw.some(hasDeclaredValue);
  return Object.entries(rec(raw)).some(([key, item]) => !['source_ref', 'sourceRef', 'fingerprint', 'unavailable_reason', 'source_revision', '_source_path'].includes(key) && hasDeclaredValue(item));
};
const readModel = (rt: PrivateRuntime) => rec(rec(rt.system).read_model);
const rowsOf = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(rec) : Object.entries(rec(value)).map(([id, row]) => ({id, ...rec(row)}));
const campaignIdOf = (row: Record<string, unknown>) => text(field(row, 'campaign_id', 'campaignId', 'primary_campaign', 'primaryCampaign'));
const testIdOf = (row: Record<string, unknown>) => text(field(row, 'test_id', 'testId'));
const sourceOf = (rt: PrivateRuntime, row: Record<string, unknown>) => text(field(row, 'source_ref', 'sourceRef')) ||
  (text(row._source_path) && text(readModel(rt).source_ref) ? `${text(readModel(rt).source_ref).split('#')[0]}#${text(row._source_path)}` : null);
const rowProvenance = (rt: PrivateRuntime, row: Record<string, unknown>) => ({sourceRef: sourceOf(rt, row), sourceVersion: rt.source_revision,
  fingerprint: rt.fingerprint, recordFingerprint: field(row, 'fingerprint'), scope: 'LOCAL_SNAPSHOT'});
const sourceRows = (rt: PrivateRuntime) => {
  const rm = readModel(rt);
  return ['work', 'tests', 'historical_tests', 'campaigns', 'hypotheses', 'artifacts'].flatMap(key => rowsOf(rm[key]).map(row => {
    // The containing canonical collection is an explicit type declaration.
    const kind = ['tests', 'historical_tests'].includes(key) ? 'TEST' : key === 'campaigns' ? 'CAMPAIGN' : null;
    return kind && !text(field(row, 'kind')) ? {...row, kind} : row;
  }));
};
const sourceCandidate = (rt: PrivateRuntime, row: Record<string, unknown>) => Object.keys(rec(row.payload)).length
  ? {...row, ...rec(row.payload), source_ref: sourceOf(rt, row)} : row;
const scienceRows = (rt: PrivateRuntime, key: string) => rowsOf(rec(science(rt))[key]);
const allTests = (rt: PrivateRuntime) => [...scienceRows(rt, 'tests'), ...scienceRows(rt, 'historical_tests')];
const scientificSourceReason = (rt: PrivateRuntime) => {
  if (!science(rt)) return 'system.science_projection_v1 ausente do runtime privado desta geração.';
  if (['campaigns', 'hypotheses', 'tests', 'historical_tests'].some(key => scienceRows(rt, key).length)) return null;
  const availability = rec(rec(rt.system).availability);
  if (['campaigns', 'hypotheses', 'tests'].every(key => rec(availability[key]).state === 'EMPTY')) return null;
  return 'A geração não fornece registros científicos nem confirma coleções científicas vazias.';
};

function programCatalog(rt: PrivateRuntime) {
  const sp = rec(science(rt)), rm = readModel(rt);
  const explicit = [...rowsOf(sp.programs), ...rowsOf(rm.programs), ...sourceRows(rt).map(row => sourceCandidate(rt, row)).filter(row => text(field(row, 'kind', 'type', 'record_type')).toUpperCase() === 'PROGRAM')];
  const programs = explicit.map(row => ({...row, id: text(field(row, 'program_id', 'programId', 'id')), sourceRef: sourceOf(rt, row)})).filter(row => row.id);
  const campaigns = scienceRows(rt, 'campaigns');
  const hasLinks = campaigns.some(row => text(field(row, 'program_id', 'programId')));
  return {programs, campaigns, available: programs.length > 0 || hasLinks || Array.isArray(sp.programs) || Array.isArray(rm.programs)};
}

const OBSERVATION_KINDS = new Set(['scalar', 'interval', 'distribution', 'directional', 'timeseries', 'matrix', 'categorical']);
type Observation = Record<string, unknown> & {id: string; metricId: string; kind: string; domains: string[]; campaignId: string | null; testId: string | null; sourceRef: string | null};
function observationCatalog(rt: PrivateRuntime) {
  const candidates: Array<{row: Record<string, unknown>; parent: Record<string, unknown>}> = [];
  let explicitLists = 0, invalid = 0;
  const addList = (value: unknown, parent: Record<string, unknown>) => {
    const rows = unwrap(value); if (!Array.isArray(rows)) return;
    explicitLists++; for (const row of rows) candidates.push({row: rec(row), parent});
  };
  addList(rec(science(rt)).observations, {}); addList(readModel(rt).observations, {});
  for (const original of sourceRows(rt)) {
    const row = sourceCandidate(rt, original);
    addList(row.observations, row);
    const kind = text(field(row, 'observation_kind', 'observationKind', 'kind')).toLowerCase();
    if (OBSERVATION_KINDS.has(kind) || text(field(row, 'kind', 'type', 'record_type')).toUpperCase() === 'OBSERVATION') candidates.push({row, parent: original});
    // A numeric test result alone is not an observation. This path still requires
    // an explicit observation identity, metric identity and supported kind.
    const result = rec(field(row, 'result', 'scientific_result'));
    if (text(field(result, 'observation_id', 'observationId'))) candidates.push({row: result, parent: row});
  }
  // Older private runtimes can carry embedded observation arrays only in their
  // evidence envelope. Avoid duplicating canonical read-model copies.
  const sourceTestIds = new Set([...rowsOf(readModel(rt).tests), ...rowsOf(readModel(rt).historical_tests)].map(row => text(row.id)));
  for (const row of allTests(rt)) if (!sourceTestIds.has(text(row.id))) addList(row.observations, {...row, kind: 'TEST'});
  const observations = new Map<string, Observation>(), conflicts = new Set<string>();
  for (const {row, parent} of candidates) {
    const id = text(field(row, 'observation_id', 'observationId', 'id'));
    const metricId = text(field(row, 'metric_id', 'metricId'));
    const kind = text(field(row, 'observation_kind', 'observationKind', 'kind')).toLowerCase();
    if (!id || !metricId || !OBSERVATION_KINDS.has(kind)) { invalid++; continue; }
    const rawValue = field(row, 'value', 'metric_value', 'metricValue');
    const value = kind === 'scalar' ? typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null : rawValue;
    const uncertainty = rec(field(row, 'uncertainty'));
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const ownDomains = arr<unknown>(field(row, 'domains')).map(text).filter(Boolean);
    const domain = text(field(row, 'domain')) || text(field(parent, 'domain'));
    const parentKind = text(field(parent, 'kind')).toUpperCase();
    const item: Observation = {...row, id, metricId, kind, value, label: text(field(row, 'label', 'title')) || id, unit: field(row, 'unit'),
      uncertainty: {low: finite(field(uncertainty, 'low') ?? field(row, 'uncertainty_low', 'uncertaintyLow')),
        high: finite(field(uncertainty, 'high') ?? field(row, 'uncertainty_high', 'uncertaintyHigh')), sigma: finite(field(uncertainty, 'sigma') ?? field(row, 'sigma')),
        confidenceLevel: field(uncertainty, 'confidenceLevel', 'confidence_level') ?? field(row, 'confidence_level', 'confidenceLevel')},
      domains: ownDomains.length ? ownDomains : domain ? [domain] : [], campaignId: campaignIdOf(row) || campaignIdOf(parent) || (parentKind === 'CAMPAIGN' ? text(parent.id) : null) || null,
      testId: testIdOf(row) || (parentKind === 'TEST' ? text(parent.id) : testIdOf(parent)) || null,
      stackId: field(row, 'stack_id', 'stackId'), stackLabel: field(row, 'stack_label', 'stackLabel'), observedAt: field(row, 'observed_at', 'observedAt'),
      sourceRef: sourceOf(rt, row) || sourceOf(rt, parent), provenance: [rowProvenance(rt, sourceOf(rt, row) ? row : parent)],
      ...(kind === 'scalar' && value === null ? {unavailable_reason: 'Valor escalar numérico não declarado na fonte.'} : {})};
    const old = observations.get(id);
    if (old && JSON.stringify(old) !== JSON.stringify(item)) conflicts.add(id);
    else observations.set(id, item);
  }
  const reason = conflicts.size ? 'Há identidades de observação ambíguas nesta geração; a consulta não escolhe silenciosamente um registro.'
    : !observations.size && (!explicitLists || invalid) ? 'Observações tipadas com identidade, metricId e kind não estão presentes nesta geração; resultados de testes não são convertidos em observações.' : null;
  return {items: [...observations.values()], reason, invalid, explicitLists, conflicts: [...conflicts]};
}
function filterObservations(rt: PrivateRuntime, args: Args) {
  const catalog = observationCatalog(rt);
  const metric = text(args.metricId ?? args.metric_id), domain = text(args.domain).toUpperCase(), campaign = text(args.campaignId ?? args.campaign_id), kind = text(args.kind).toLowerCase();
  const all = catalog.items.filter(row => (!metric || row.metricId === metric) && (!domain || row.domains.some(value => value.toUpperCase() === domain)) && (!campaign || row.campaignId === campaign) && (!kind || row.kind === kind));
  const limit = bounded(args.limit, 100, 500);
  return {...meta(rt), items: all.slice(0, limit), total: all.length, truncated: all.length > limit,
    coverage: 'EXPLICIT_SOURCE_OBSERVATIONS_ONLY', invalid_records: catalog.invalid};
}

function activityReason(rt: PrivateRuntime) {
  const rm = readModel(rt), activity = rm.activity;
  const coverage = rec(rec(rm.coverage).events), state = text(coverage.status ?? coverage.state).toUpperCase();
  if (!Array.isArray(activity)) return 'read_model.activity ausente desta geração.';
  if (activity.length) return null;
  if ((coverage.complete === true || coverage.confirmed_empty === true || state === 'EMPTY') && state !== 'NOT_PRESENT') return null;
  return 'Nenhum evento foi fornecido e a fonte não confirma um histórico de atividade vazio.';
}
function changesReason(rt: PrivateRuntime) {
  const diff = rec(rt.world.diff);
  if (!text(diff.previous)) return 'Esta geração não inclui fingerprint anterior; não há comparação entre gerações disponível.';
  if (diff.current !== rt.world.fingerprint || !['added', 'updated', 'removed', 'providerChanges'].every(key => Array.isArray(diff[key]))) return 'A comparação WorldState não está vinculada ao fingerprint do mundo atual ou está incompleta.';
  return null;
}
function recordReferences(rt: PrivateRuntime, row: Record<string, unknown>): string[] {
  const values = [sourceOf(rt, row)];
  for (const key of ['artifacts', 'artifact_refs', 'evidence_refs', 'datasets']) for (const value of arr<unknown>(field(row, key))) {
    if (typeof value === 'string') values.push(value);
    else { const record = rec(value); values.push(text(field(record, 'source_ref', 'sourceRef', 'ref', 'path'))); }
  }
  return values.filter((value): value is string => !!value);
}
function evidenceChain(rt: PrivateRuntime, args: Args) {
  const campaign = text(args.campaignId ?? args.campaign_id), testId = text(args.testId ?? args.test_id), sourceRef = text(args.sourceRef ?? args.source_ref), limit = bounded(args.limit, 100, 500);
  const tests = allTests(rt).filter(row => (!campaign || campaignIdOf(row) === campaign) && (!testId || text(row.id) === testId) && (!sourceRef || recordReferences(rt, row).includes(sourceRef)));
  const testIds = new Set(tests.map(row => text(row.id))), campaignIds = new Set(tests.map(campaignIdOf)), hypothesisIds = new Set(tests.map(row => text(field(row, 'hypothesis_id', 'hypothesis_ref'))));
  const campaigns = scienceRows(rt, 'campaigns').filter(row => campaignIds.has(text(row.id)) || (campaign && !testId && !sourceRef && text(row.id) === campaign));
  const hypotheses = scienceRows(rt, 'hypotheses').filter(row => hypothesisIds.has(text(row.id)));
  const results = tests.filter(row => hasDeclaredValue(row.result) || hasDeclaredValue(row.statistics)).map(row => ({id: row.id, testId: row.id, campaignId: campaignIdOf(row) || null,
    kind: 'RECORDED_RESULT_FIELDS', result: row.result ?? null, statistics: row.statistics ?? null, verdict: row.verdict ?? null, claimBoundary: row.claim_boundary ?? null,
    sourceRef: sourceOf(rt, row), provenance: [rowProvenance(rt, row)]}));
  const evidence = tests.flatMap(row => ['artifacts', 'artifact_refs', 'evidence_refs'].flatMap(referenceField => arr<unknown>(field(row, referenceField)).map(raw => {
    const item = rec(raw), ref = typeof raw === 'string' ? raw : text(field(item, 'source_ref', 'sourceRef', 'ref', 'path'));
    return {...item, id: field(item, 'id'), kind: 'DECLARED_EVIDENCE_REFERENCE', reference_field: referenceField, testId: row.id, campaignId: campaignIdOf(row) || null,
      sourceRef: ref || null, label: ref || text(field(item, 'label', 'title')) || null, record: raw, provenance: [rowProvenance(rt, row)]};
  }).filter(row => !sourceRef || row.sourceRef === sourceRef || sourceOf(rt, tests.find(test => test.id === row.testId) ?? {}) === sourceRef)));
  const observations = observationCatalog(rt);
  const matches = observations.items.filter(row => (!campaign || row.campaignId === campaign) && (!testId || row.testId === testId) && (!sourceRef || row.sourceRef === sourceRef) && (!testIds.size || !!row.testId && testIds.has(row.testId)));
  const groups = {tests, campaigns, hypotheses, results, evidence};
  return {...meta(rt), campaignId: campaign || null, testId: testId || null, sourceRef: sourceRef || null,
    ...Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.slice(0, limit)])),
    observations: observations.reason ? null : matches.slice(0, limit), unavailable: observations.reason ? {observations: observations.reason} : {},
    totals: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
    truncated: Object.values(groups).some(rows => rows.length > limit) || matches.length > limit,
    provenance: tests.slice(0, limit).map(row => rowProvenance(rt, row)), coverage: 'DECLARED_LINKS_IN_CURRENT_RUNTIME'};
}

export const DEFS: Def[] = [
  {name: 'search_atlas', description: 'Busca lexical nos nós do runtime (id, rótulo, resumo, domínio, tipo, estado).',
    inputSchema: {type: 'object', properties: {query: str, q: str, limit: lim(200)}}, unavailable: () => null,
    run(rt, a) {
      const needle = text(a.query ?? a.q).toLocaleLowerCase();
      const hit = nodes(rt).filter(n => !needle || [n.id, n.label, n.summary, n.domain, n.type, n.state, n.operational_status].map(text).join(' ').toLocaleLowerCase().includes(needle));
      const items = hit.slice(0, bounded(a.limit, 50, 200)).map(nodeView);
      return {...meta(rt), query: text(a.query ?? a.q), items, total: hit.length};
    }},
  {name: 'get_operations', description: 'Fila WORK do runtime (system.projected_work), valores ausentes aparecem como indisponíveis.',
    inputSchema: {type: 'object', properties: {limit: lim(500)}},
    unavailable: rt => (Array.isArray(rt.system.projected_work) ? null : 'system.projected_work ausente do runtime privado desta geração.'),
    run(rt, a) {
      const all = arr<Node>(rt.system.projected_work);
      const items = all.slice(0, bounded(a.limit, 100, 500)).map(n => ({id: n.id, kind: nul(n.type), title: nul(n.label), status: nul(n.operational_status),
        priority: nul(n.priority), updatedAt: nul(n.checked_at), ownerRole: nul(n.owner_role), humanGate: nul(n.human_gate), blocker: nul(n.blocker), sourceRef: nul(n.source_ref)}));
      return {...meta(rt), items, total: all.length};
    }},
  {name: 'get_provenance', description: 'Proveniência de uma entidade do runtime, ou da própria geração quando sem id.',
    inputSchema: {type: 'object', properties: {id: str, entityId: str, entity_id: str}}, unavailable: () => null,
    run(rt, a) {
      const id = text(a.id ?? a.entityId ?? a.entity_id);
      if (!id) return {...meta(rt), entity: null, provenance: [{runtime_contract: rt.contract, fingerprint: rt.fingerprint, source_revision: rt.source_revision, generated_at: rt.generated_at, bus_fingerprint: nul(rt.system.bus?.fingerprint)}]};
      const sp = science(rt);
      const rec2 = [...arr<Record<string, unknown>>(sp?.campaigns), ...arr<Record<string, unknown>>(sp?.hypotheses), ...arr<Record<string, unknown>>(sp?.tests), ...arr<Record<string, unknown>>(sp?.historical_tests)].find(r => text(r.id) === id);
      const n = nodes(rt).find(x => x.id === id);
      const entity = n ? {...nodeView(n), authority_class: nul(n.authority_class), freshness: nul(n.freshness), checked_at: nul(n.checked_at), unavailable_reason: nul(n.unavailable_reason)} : rec2 ?? null;
      const src = n ?? rec2;
      return {...meta(rt), entityId: id, entity,
        provenance: src ? [{source_ref: nul(src.source_ref), source_revision: nul((src as Node).source_revision), fingerprint: nul(src.fingerprint), checked_at: nul((src as Node).checked_at)}] : []};
    }},
  {name: 'get_science_state', description: 'Registros científicos publicados no runtime (campanhas, hipóteses, testes), por referência.',
    inputSchema: {type: 'object', properties: {}},
    unavailable: rt => (science(rt) ? null : 'system.science_projection_v1 ausente do runtime privado desta geração.'),
    run(rt) {
      const sp = science(rt)!; const ref = (r: Record<string, unknown>) => ({id: nul(r.id), source_ref: nul(r.source_ref), fingerprint: nul(r.fingerprint)});
      return {...meta(rt), source: nul(sp.source), campaigns: arr<Record<string, unknown>>(sp.campaigns).map(ref), hypotheses: arr<Record<string, unknown>>(sp.hypotheses).map(ref), tests: arr<Record<string, unknown>>(sp.tests).map(ref)};
    }},
  {name: 'get_campaign', description: 'Uma campanha do runtime e os testes que a referenciam por campaign_id.',
    inputSchema: {type: 'object', properties: {id: str, campaignId: str, campaign_id: str}},
    unavailable: rt => (science(rt) ? null : 'system.science_projection_v1 ausente do runtime privado desta geração.'),
    run(rt, a) {
      const id = text(a.id ?? a.campaignId ?? a.campaign_id); const sp = science(rt)!;
      const campaign = arr<Record<string, unknown>>(sp.campaigns).find(r => text(r.id) === id) ?? null;
      const tests = campaign ? arr<Record<string, unknown>>(sp.tests).filter(t => campaignIdOf(t) === id) : [];
      return {...meta(rt), campaign, tests};
    }},
  {name: 'get_program', description: 'Programa declarado e campanhas ligadas por program_id; referências não inventam um registro de programa.',
    inputSchema: {type: 'object', properties: {id: str, programId: str, program_id: str}},
    unavailable: rt => programCatalog(rt).available ? null : 'Não há registro de programa nem vínculos program_id declarados nesta geração.',
    run(rt, args) {
      const id = text(args.id ?? args.programId ?? args.program_id), catalog = programCatalog(rt);
      if (!id) throw new Error('Informe o identificador do programa.');
      const candidates = catalog.programs.filter(row => row.id === id);
      if (candidates.length > 1) throw new Error('Identidade de programa ambígua nesta geração.');
      const program = candidates[0] ?? null;
      const campaigns = catalog.campaigns.filter(row => text(field(row, 'program_id', 'programId')) === id);
      return {...meta(rt), programId: id || null, program, campaigns: campaigns.slice(0, 500), total: campaigns.length, truncated: campaigns.length > 500,
        program_record_status: program ? 'PRESENT' : campaigns.length ? 'REFERENCE_ONLY' : 'NOT_FOUND_IN_RUNTIME',
        unavailable: !program && campaigns.length ? {program: 'O vínculo program_id existe; o registro do programa não foi fornecido.'} : {}};
    }},
  {name: 'get_observations', description: 'Observações tipadas explicitamente registradas; nenhum valor, métrica ou incerteza é inferido.',
    inputSchema: {type: 'object', properties: {metricId: str, metric_id: str, domain: str, campaignId: str, campaign_id: str, kind: str, limit: lim(500)}},
    unavailable: rt => observationCatalog(rt).reason, run: filterObservations},
  {name: 'get_h0_stacks', description: 'Somente observações com metricId canônico cosmology.H0; preserva os stacks declarados.',
    inputSchema: {type: 'object', properties: {}}, unavailable: rt => observationCatalog(rt).reason,
    run: rt => ({...filterObservations(rt, {metricId: 'cosmology.H0', limit: 500}), metricId: 'cosmology.H0'})},
  {name: 'get_evidence_chain', description: 'Testes, hipóteses, campanhas e referências de evidência ligados por IDs canônicos nesta geração.',
    inputSchema: {type: 'object', properties: {campaignId: str, campaign_id: str, testId: str, test_id: str, sourceRef: str, source_ref: str, limit: lim(500)}},
    unavailable: scientificSourceReason, run: evidenceChain},
  {name: 'get_changes', description: 'Comparação WorldState declarada pela fonte e vinculada ao fingerprint atual; não compara toda a Tower.',
    inputSchema: {type: 'object', properties: {}}, unavailable: changesReason,
    run(rt) {
      const diff = rec(rt.world.diff), keys = ['added', 'updated', 'removed', 'providerChanges'];
      return {...meta(rt), comparison_scope: 'WORLD_ITEMS_ONLY', previous: diff.previous, current: diff.current,
        ...Object.fromEntries(keys.map(key => [key, arr<unknown>(diff[key]).slice(0, 500).map(value => typeof value === 'string' ? {id: value, kind: key, sourceRef: rt.world.items.find(item => item.id === value)?.sourceRef ?? null} : value)])),
        totals: Object.fromEntries(keys.map(key => [key, arr(diff[key]).length])), truncated: keys.some(key => arr(diff[key]).length > 500)};
    }},
  {name: 'get_activity', description: 'Eventos canônicos recebidos nesta geração, com horários originais e sem telemetria de servidor.',
    inputSchema: {type: 'object', properties: {limit: lim(500)}}, unavailable: activityReason,
    run(rt, args) {
      const all = rowsOf(readModel(rt).activity).map(row => ({...row, id: field(row, 'id', 'event_id'), eventType: field(row, 'event_type', 'eventType'),
        at: field(row, 'at'), entityId: field(row, 'entity_id', 'entity_name', 'entity_ref'), sourceRef: sourceOf(rt, row)}))
        .sort((a, b) => {const time = (value: unknown) => Number.isFinite(Date.parse(text(value))) ? Date.parse(text(value)) : Number.NEGATIVE_INFINITY; return time(b.at) - time(a.at);});
      const limit = bounded(args.limit, 100, 500);
      return {...meta(rt), items: all.slice(0, limit), total: all.length, truncated: all.length > limit,
        coverage: rec(rec(readModel(rt).coverage).events), activity_scope: 'CANONICAL_SOURCE_EVENTS'};
    }},
];

export function describeTools(rt: PrivateRuntime): McpTool[] {
  return DEFS.map(d => {
    const why = d.unavailable(rt);
    return {name: d.name, description: why ? `${d.description} Indisponível: ${why}` : d.description, category: 'Runtime privado', access: 'PRIVATE',
      availability: why ? 'UNAVAILABLE' : 'AVAILABLE', inputSchema: d.inputSchema,
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false}};
  });
}

export function statusFor(rt: PrivateRuntime): McpStatus {
  const tools = describeTools(rt);
  return {contract: 'NEXO_MCP_STATUS_V1',
    server: {name: 'Consultas locais do runtime privado', version: rt.contract, endpoint: MCP_ENDPOINT, transport: 'in-memory', mode: 'read-only', access: 'PRIVATE'},
    status: 'LOCAL_SNAPSHOT', generated_at: rt.generated_at, last_read_at: null, fingerprint: science(rt) ? ((rt.system.science_projection_v1 as {fingerprint?: string}).fingerprint ?? null) : null,
    projectionFingerprint: rt.fingerprint, sourceVersion: rt.source_revision, authority: null, freshness: 'SNAPSHOT', provenance: null,
    tools, tool_count: tools.length, telemetry: null};
}

function checkArgs(def: Def, args: Args) {
  const props = def.inputSchema.properties ?? {};
  for (const [k, v] of Object.entries(args)) {
    const s = props[k];
    if (!s) throw new Error(`Argumento não suportado: ${k}`);
    if (s.type === 'integer') { if (!Number.isInteger(v) || (s.minimum !== undefined && (v as number) < s.minimum) || (s.maximum !== undefined && (v as number) > s.maximum)) throw new Error(`Argumento inválido: ${k}`); }
    else if (typeof v !== 'string' || (s.maxLength !== undefined && v.length > s.maxLength)) throw new Error(`Argumento inválido: ${k}`);
  }
}

const abortIf = (signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError'); };

export async function readMcpStatus(signal?: AbortSignal): Promise<McpStatus> {
  abortIf(signal);
  const rt = runtimeHolder.get();
  if (!rt) throw new Error('Runtime privado não carregado.');
  return statusFor(rt);
}

export async function callReadOnlyTool(tool: McpTool, args: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  abortIf(signal);
  if (tool.annotations?.readOnlyHint !== true || tool.access !== 'PRIVATE') throw new Error('Esta ferramenta exige outro nível de acesso.');
  const rt = runtimeHolder.get();
  if (!rt) throw new Error('Runtime privado não carregado.');
  const def = DEFS.find(d => d.name === tool.name);
  if (!def) throw new Error('Ferramenta desconhecida.');
  const why = def.unavailable(rt); // evaluated against the CURRENT generation, not the descriptor the panel holds
  if (why) throw new Error(`Indisponível: ${why}`);
  checkArgs(def, args);
  return structuredClone(def.run(rt, args));
}
