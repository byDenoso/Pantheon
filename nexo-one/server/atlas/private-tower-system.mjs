/**
 * Pure, read-only presentation of one verified PRIVATE Tower generation.
 * This module never reads files, authenticates, publishes, or sanitizes for Pages.
 * Original records live in read_model; rendering aliases never replace their facts.
 */
import {createHash} from 'node:crypto';

const CORE_DOMAINS = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'];
const COLLECTIONS = ['work', 'tests', 'hypotheses', 'campaigns', 'roadmaps', 'lessons', 'interdomain', 'artifacts'];
const KIND = {work:'work', tests:'test', hypotheses:'hypothesis', campaigns:'campaign', roadmaps:'roadmap', lessons:'lesson', interdomain:'interdomain', artifacts:'artifact'};
const TYPE = {work:'ACTION', tests:'TEST', hypotheses:'CLAIM', campaigns:'CAMPAIGN', roadmaps:'CAMPAIGN', lessons:'MEMORY', interdomain:'FILAMENT', artifacts:'EFFECT'};
const ACTION_STATES = new Set(['PROPOSED','ELIGIBLE','AWAITING_HUMAN','RUNNING','APPLIED','NO_OP_ALREADY_APPLIED','WAITING_SIDE_QUEST','BLOCKED','FAILED']);
const RUNTIMES = new Set(['LOCAL','GITHUB_ACTIONS','VERCEL','NEXO_KERNEL','HUMAN']);
const SCIENTIFIC_VERDICTS = new Set(['SUPPORTS','NULL','FALSIFIES','INCONCLUSIVE','PENDING']);
const SCIENTIFIC_STATES = new Set([...SCIENTIFIC_VERDICTS,'PROMOTED','SUPPORTED','REJECTED','FALSIFIED','CONFIRMED','REFUTED']);
const OPERATIONS = new Set(['READ','WRITE','SCHEDULE','DEPLOY','NOTIFY']);
const HUMAN_KINDS = new Set(['DECIDIR','APROVAR','RESPONDER','ESCOLHER','FORNECER_DADO','CONFIGURAR_ACESSO']);
const TERMINAL = new Set(['DONE','COMPLETE','COMPLETED','CLOSED','CANCELLED','ARCHIVED','RETIRED','SUPERSEDED','VERIFIED','APPLIED','NO_OP_ALREADY_APPLIED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const upper = value => text(value).toUpperCase();
const strings = value => (Array.isArray(value) ? value : value == null ? [] : [value]).filter(value => typeof value === 'string' && value.length);
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const own = (value, key) => object(value) && Object.hasOwn(value, key);
const uniq = values => [...new Set(values)];
const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '') ?? null;
const stable = value => JSON.stringify(value, (_, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const digest = value => 'sha256:' + createHash('sha256').update(stable(value)).digest('hex');
function reject(reason) { const error = new Error('PRIVATE_TOWER_SYSTEM_INVALID:' + reason); error.code = 'PRIVATE_TOWER_SYSTEM_INVALID'; throw error; }
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const unknownFreshness = observedAt => ({state:'UNKNOWN', observed_at:validDate(observedAt) ? observedAt : null, ttl_seconds:null});
const identity = (row, kind) => text(first(row[`${kind}_id`], kind === 'test' ? row.test_record_id : null, row.id, row.entity_id));
const domainOf = row => text(first(row.domain, row.lane, row.semantic?.domain_id)) || 'UNKNOWN';
const rowStatus = row => text(first(row.operational_status, row.status, row.state)) || 'UNKNOWN';
const projectionState = row => /^(?:BLOCKED|FAIL(?:ED)?|ERROR)(?:_|$)/.test(upper(rowStatus(row))) ? 'BLOCKED' : 'SNAPSHOT';
const labelOf = (row,id) => text(first(row.semantic?.display_name,row.display_name,row.title,row.label,row.name,row.question,row.statement,row.lesson,row.heuristic)) || id;
const summaryOf = row => text(first(row.summary,row.description,row.semantic?.description,row.result_meaning,row.statement,row.lesson,row.heuristic,row.question));
const refOf = (sourceRef,row,fallback) => `${sourceRef.split('#')[0]}#${text(row?._source_path) || fallback}`;
const provenanceOf = (ctx,row,path) => ({source_ref:refOf(ctx.sourceRef,row,path), source_revision:ctx.revision, fingerprint:ctx.revision,
  checked_at:ctx.generatedAt, freshness:object(row?.freshness) ? {...unknownFreshness(null),...row.freshness} : unknownFreshness(first(row?.updated_at,row?.checked_at))});
const unavailable = (reason,sourceRef) => ({state:'UNAVAILABLE', reason, source_ref:sourceRef});

function collectionCoverage(records,key,count,sourceRef) {
  const raw = records.coverage?.[key];
  const present = raw === true || raw?.present === true || raw?.source_present === true || raw?.available === true || ['AVAILABLE','PRESENT','EMPTY','COMPLETE'].includes(upper(raw?.state ?? raw?.status));
  const complete = raw?.complete === true || raw?.confirmed_empty === true || raw?.authoritative_empty === true || ['EMPTY','COMPLETE'].includes(upper(raw?.state ?? raw?.status));
  if (raw?.complete === false || raw?.partial === true || ['PARTIAL','INCOMPLETE','ERROR','FAILED'].includes(upper(raw?.state ?? raw?.status))) return {...(object(raw) ? raw : {}),state:'PARTIAL',count,source_ref:sourceRef,reason:'A fonte declara esta coleção incompleta; agregados completos não são inferidos.'};
  if (count) return {...(object(raw) ? raw : {}),state:'AVAILABLE',count,source_ref:sourceRef};
  if (present && complete) return {...(object(raw) ? raw : {}),state:'EMPTY',count:0,source_ref:sourceRef};
  return {...(object(raw) ? raw : {}),...unavailable('Canonical collection is absent or does not establish an authoritative empty collection.',sourceRef),count:0};
}

function normalizeCollections(records) {
  const out = {};
  for (const key of COLLECTIONS) {
    if (records[key] != null && !Array.isArray(records[key])) reject(`${key}_NOT_ARRAY`);
    const seen = new Set();
    out[key] = list(records[key]).map(row => {
      if (!object(row)) reject(`${key}_RECORD_INVALID`);
      const id = identity(row,KIND[key]);
      if (!id || seen.has(id)) reject(`${key}_IDENTITY_INVALID`);
      seen.add(id);
      return {...row,id};
    }).sort((a,b) => a.id.localeCompare(b.id));
  }
  return out;
}

function humanGate(row) {
  if (row.human_gate === false) return null;
  const declared = object(row.human_gate) ? row.human_gate : {};
  const dependencies = list(first(row.remaining_dependencies,row.dependencies)).filter(dep => !['SATISFIED','RESOLVED','DONE','CLOSED'].includes(upper(dep?.status ?? dep?.state)));
  const classes = uniq([...strings(row.dependency_classes),...strings(row.dependency_class),...dependencies.map(dep => text(dep?.dependency_class))]);
  const status = upper(rowStatus(row));
  const active = !TERMINAL.has(status) && declared.pending !== false && declared.required !== false && !['RESOLVED','APPROVED','SATISFIED','CLOSED','DONE'].includes(upper(first(declared.state,declared.status)));
  const isHuman = active && (row.human_gate === true || declared.required === true || declared.pending === true ||
    (object(row.human_gate) && ((HUMAN_KINDS.has(upper(declared.kind)) && text(declared.question)) || ['PENDING','WAITING','OPEN','AWAITING_HUMAN','WAIT_HUMAN'].includes(upper(first(declared.state,declared.status))))) || row.decision_required === true || row.needs_human === true || row.human_action_required === true ||
    ['AWAITING_HUMAN','WAIT_HUMAN','WAITING_HUMAN','NEEDS_HUMAN','NEEDS_YOU'].includes(status) || classes.some(value => /^HUMAN_/.test(value)));
  if (!isHuman) return null;
  const declaredKind = upper(first(declared.kind,row.human_kind));
  const kind = HUMAN_KINDS.has(declaredKind) ? declaredKind : classes.some(value => /HUMAN_AUTH/.test(value)) ? 'CONFIGURAR_ACESSO'
    : classes.some(value => /HUMAN_APPROVAL/.test(value)) ? 'APROVAR' : classes.some(value => /HUMAN_INPUT/.test(value)) ? 'FORNECER_DADO'
      : classes.some(value => /HUMAN_RESPONSE/.test(value)) ? 'RESPONDER' : classes.some(value => /HUMAN_CHOICE/.test(value)) ? 'ESCOLHER' : 'DECIDIR';
  return {...declared,kind,question:text(first(declared.question,row.question,row.required_resolution,row.next_action)) || 'A fonte exige uma decisão humana; a pergunta não foi registrada.',
    options:list(first(declared.options,row.options)).map(option => object(option) ? {...option} : {id:String(option),label:String(option),consequence:'Não informada na fonte.'})};
}

function readbackOf(row) {
  const raw = object(row.readback) ? row.readback : {};
  const state = upper(first(raw.status,row.readback_status,typeof row.readback === 'string' ? row.readback : null));
  const status = ['CONFIRMED','PENDING','FAILED','UNVERIFIED','NOT_APPLICABLE'].includes(state) ? state : state === 'PASS' ? 'CONFIRMED' : state === 'FAIL' ? 'FAILED' : 'UNVERIFIED';
  return {...raw,status,provider:first(raw.provider,row.provider),observed_fingerprint:first(raw.observed_fingerprint,row.observed_fingerprint),
    checked_at:first(raw.checked_at,row.readback_at),explanation:text(first(raw.explanation,row.readback_explanation)) || 'Readback não informado pela fonte canônica.'};
}

function actionOf(row,ctx) {
  const gate = humanGate(row), rawStatus = upper(rowStatus(row));
  const readback = readbackOf(row);
  let status = gate ? 'AWAITING_HUMAN' : ACTION_STATES.has(rawStatus) ? rawStatus
    : /^BLOCKED/.test(rawStatus) ? 'BLOCKED' : /^(?:FAIL(?:ED)?|ERROR)(?:_|$)/.test(rawStatus) ? 'FAILED'
      : ['RUNNING','DISPATCHED','IN_PROGRESS'].includes(rawStatus) ? 'RUNNING'
        : ['WAIT_DEPENDENCY','WAITING_SIDE_QUEST'].includes(rawStatus) ? 'WAITING_SIDE_QUEST'
          : ['READY','QUEUED','CHECKPOINTED'].includes(rawStatus) ? 'PROPOSED' : 'UNKNOWN';
  if (TERMINAL.has(rawStatus)) status = ['DONE','COMPLETE','COMPLETED','VERIFIED','APPLIED','NO_OP_ALREADY_APPLIED'].includes(rawStatus) && readback.status === 'CONFIRMED' ? (rawStatus === 'NO_OP_ALREADY_APPLIED' ? rawStatus : 'APPLIED') : 'UNKNOWN';
  const runtime = RUNTIMES.has(upper(row.runtime)) ? upper(row.runtime) : 'UNKNOWN';
  const operation = OPERATIONS.has(upper(first(row.required_operation,row.operation))) ? upper(first(row.required_operation,row.operation)) : 'UNKNOWN';
  const risk = ['LOW','MEDIUM','HIGH'].includes(upper(row.risk)) ? upper(row.risk) : 'UNKNOWN';
  const reversible = typeof row.reversible === 'boolean' ? row.reversible : null;
  return {...row,...provenanceOf(ctx,row,`entities/work/${row.id}.json`),action_id:text(first(row.action_id,row.id)),lane:domainOf(row),title:labelOf(row,row.id),status,
    canonical_status:rowStatus(row),required_operation:operation,runtime,risk,reversible,capability_id:first(row.capability_id,row.required_capability_id),
    effect_key:first(row.effect_key),input_fingerprint:first(row.input_fingerprint,ctx.revision),readback,receipt_ref:first(row.receipt_ref),
    blocker:first(row.blocker),next_action:text(row.next_action) || 'Próxima ação não informada pela fonte.',
    eligibility:text(first(row.eligibility,row.automation_reason,row.automation?.reason)) || 'Projeção privada somente de leitura; autorização de execução não é inferida.',
    human_gate:gate,updated_at:text(first(row.updated_at,row.last_checked,ctx.generatedAt)),
    unavailable_fields:[...(runtime === 'UNKNOWN' ? ['runtime'] : []),...(operation === 'UNKNOWN' ? ['required_operation'] : []),...(risk === 'UNKNOWN' ? ['risk'] : []),...(reversible === null ? ['reversible'] : []),...(status === 'UNKNOWN' ? ['status'] : [])]};
}

function inboxOf(action,row,ctx) {
  if (!action.human_gate) return null;
  const gate = action.human_gate;
  const requirement = dep => ({...dep,id:text(first(dep.id,dep.dependency_class)) || 'UNSPECIFIED',label:text(first(dep.label,dep.title,dep.dependency_class)) || 'Dependência',
    detail:text(first(dep.detail,dep.description,dep.next_action)) || 'Detalhe não informado.',state:first(dep.state,dep.status)});
  const dependencies = list(first(row.remaining_dependencies,row.dependencies)).filter(object);
  return {id:`human:${row.id}`,kind:gate.kind,domain:action.lane,title:action.title,question:gate.question,
    why:text(first(gate.why,row.blocker,row.why)) || 'Intervenção humana explicitamente exigida pela fonte.',action_id:action.action_id,options:gate.options,
    severity:['P0','P1','P2','INFO'].includes(row.priority) ? row.priority : 'INFO',due_at:first(gate.due_at,row.due_at),
    ...provenanceOf(ctx,row,`entities/work/${row.id}.json`),human_requirements:dependencies.filter(dep => /^HUMAN_/.test(text(dep.dependency_class))).map(requirement),
    automatic_requirements:dependencies.filter(dep => !/^HUMAN_/.test(text(dep.dependency_class))).map(requirement),
    system_next:first(row.system_next,row.next_action),readback_criteria:list(row.readback_criteria),action_location:first(gate.action_location,row.action_location)};
}

function capabilitiesOf(records,ctx) {
  if (records.capabilities != null && !object(records.capabilities)) reject('CAPABILITIES_INVALID');
  return Object.entries(records.capabilities || {}).sort(([a],[b]) => a.localeCompare(b)).map(([id,value]) => {
    const row = object(value) ? value : {status:value};
    const rawStatus = upper(row.status);
    const status = ['PASS','UNVERIFIED','UNKNOWN','RETIRED_RUNTIME','BLOCKED'].includes(rawStatus) ? rawStatus
      : ['VERIFIED','VALIDATED_CURRENT','PROVEN'].includes(rawStatus) ? 'PASS' : ['RETIRED','DISABLED','REMOVED'].includes(rawStatus) ? 'RETIRED_RUNTIME'
        : ['ACTIVE','DECLARED','READY','AVAILABLE'].includes(rawStatus) ? 'UNVERIFIED' : /^(?:BLOCKED|UNAVAILABLE|MISSING|FAILED|ERROR)(?:_|$)/.test(rawStatus) ? 'BLOCKED' : 'UNKNOWN';
    return {...row,...provenanceOf(ctx,row,`manifests/capabilities.json/${id}`),capability_id:id,label:labelOf(row,id),domain:domainOf(row),
      runtime:RUNTIMES.has(upper(row.runtime)) ? upper(row.runtime) : 'UNKNOWN',operation:OPERATIONS.has(upper(row.operation)) ? upper(row.operation) : null,
      status,canonical_status:first(row.status),risk:['LOW','MEDIUM','HIGH'].includes(upper(row.risk)) ? upper(row.risk) : null,
      provider:text(first(row.provider,row.backend)) || 'UNKNOWN',last_verified_at:first(row.last_verified_at,row.last_tested_at),evidence_ref:first(row.evidence_ref,row.evidence_pointer),
      explanation:text(first(row.explanation,row.notes)) || 'Estado declarado pela Tower; disponibilidade não equivale a prova de execução.'};
  });
}

const SCIENCE_FIELDS = {
  campaign:{title:['title','label'],question:['question','scientific_question'],question_plain:['question_plain','semantic.question_plain'],why_it_matters:['why_it_matters','semantic.why_it_matters'],hypothesis_ids:['hypothesis_ids','hypothesis_refs'],status:['status','state'],members:['members','test_ids'],prereg_ref:['prereg_ref'],started_at:['started_at']},
  hypothesis:{statement:['statement','proposition'],model:['model'],baseline:['baseline'],falsification_criterion:['falsification_criterion','kill_criteria'],origin:['origin','proposed_by'],test_ids:['test_ids'],claim_boundary:['claim_boundary']},
  test:{campaign_id:['campaign_id'],hypothesis_id:['hypothesis_id','hypothesis_ref'],roadmap_id:['roadmap_id'],domain:['domain'],status:['status','state'],review_state:['review_state'],method:['method','methodology','mechanism'],datasets:['datasets','dataset','input_contract.dataset'],
    preregistered_metric:['preregistered_metric','metric','prereg.metric','decision_contract.metric'],threshold:['threshold','preregistered_threshold','prereg.threshold','decision_contract.threshold'],
    verdict:['scientific_verdict','verdict'],claim_level:['claim_level'],robustness_checks:['robustness_checks'],artifacts:['artifacts','artifact_refs','evidence_refs'],limitations:['limitations'],claim_boundary:['claim_boundary'],publication_status:['publication_status']},
};
function getPath(row,path) { return path.split('.').reduce((value,key) => object(value) ? value[key] : undefined,row); }
function evidenceField(row,paths,ctx,sourcePath) {
  const selected = paths.find(path => getPath(row,path) !== undefined);
  const value = selected === undefined ? null : getPath(row,selected);
  return {value:value ?? null,unavailable_reason:value == null ? (selected === undefined ? `Campo canônico ausente: ${paths[0]}.` : `A fonte declarou ${selected} como nulo.`) : null,
    source_ref:refOf(ctx.sourceRef,row,sourcePath),fingerprint:ctx.revision};
}
function scienceRecord(row,kind,ctx) {
  const path = `entities/${kind}/${row.id}.json`;
  const out = Object.fromEntries(Object.keys(row).filter(key => !['id','source_ref','fingerprint','_source_path'].includes(key)).map(key => [key,evidenceField(row,[key],ctx,path)]));
  for (const [key,paths] of Object.entries(SCIENCE_FIELDS[kind])) out[key] = evidenceField(row,paths,ctx,path);
  if (kind === 'test') {
    out.raw_verdict = evidenceField(row,['verdict'],ctx,path);
    if (out.verdict.value !== null && !SCIENTIFIC_VERDICTS.has(upper(out.verdict.value))) out.verdict = {...out.verdict,value:null,unavailable_reason:'O veredito original não é um veredito científico calibrado; preservado em raw_verdict e read_model.'};
    // Charts consume nested evidence envelopes. Keep every original field as well
    // as explicit null envelopes for absent metrics; no verdict is inferred.
    for (const [key,fields] of Object.entries({result:['parameter','value','err_lo','err_hi','unit'],statistics:['delta_chi2','delta_bic','ln_bayes_factor','sigma_raw','sigma_lee','p_value'],reproducibility:['script_hash','commit','seed','data_lock'],audit:['data_lock']})) {
      const raw = first(row[key],key === 'result' ? row.scientific_result : row.scientific_result?.[key]);
      if (key === 'result' && raw != null && !object(raw)) { out[key] = evidenceField(row,[key,'scientific_result'],ctx,path); continue; }
      out[key] = Object.fromEntries(uniq([...fields,...Object.keys(object(raw) ? raw : {})]).map(field => [field,evidenceField(row,[`${key}.${field}`,`scientific_result.${key}.${field}`,...(key === 'result' ? [`scientific_result.${field}`] : [])],ctx,path)]));
    }
  }
  return {...out,id:row.id,source_ref:refOf(ctx.sourceRef,row,path),fingerprint:ctx.revision};
}

function graphNode(row,key,ctx) {
  const kind = KIND[key],sem = object(row.semantic) ? row.semantic : {},gate = key === 'work' ? humanGate(row) : null;
  const node = {id:`${kind}:${row.id}`,canonical_id:row.id,type:TYPE[key],label:labelOf(row,row.id),domain:domainOf(row),state:projectionState(row),
    authority_class:'DERIVED',...provenanceOf(ctx,row,`${key === 'roadmaps' ? 'roadmaps' : 'entities/'+kind}/${row.id}.json`),summary:summaryOf(row),
    operational_status:rowStatus(row),scientific_state:SCIENTIFIC_STATES.has(upper(first(row.scientific_state,row.scientific_verdict,row.verdict))) ? text(first(row.scientific_state,row.scientific_verdict,row.verdict)) : 'UNKNOWN',canonical_verdict:first(row.verdict),
    attempt_state:text(first(row.attempt_state,row.execution_phase,row.execution?.status)) || 'UNKNOWN',review_state:text(row.review_state) || 'UNKNOWN',
    canonical_kind:first(row.kind,kind.toUpperCase()),private:row.private === true,visibility:first(row.visibility),
    ...(key === 'work' ? {human_gate:!!gate,decision_required:!!gate} : {})};
  for (const field of ['campaign_id','hypothesis_id','roadmap_id','test_group_id','priority','dependency_class','owner_role','blocked_since','blocker','automation_eligible','automation_reason','member_count','semantic_description','semantic_state','atlas_visible','parent_subdomain','semantic_domain','semantic_subdomain_id','semantic_topic_id','semantic_subdomain','semantic_topic','semantic_basis','status_group','question_plain','result_meaning','source_links','runtime','evidence']) {
    if (own(row,field)) node[field] = row[field];
  }
  for (const [field,value] of Object.entries({semantic_domain:sem.domain_id,semantic_subdomain_id:sem.subdomain_id,semantic_topic_id:sem.topic_id,
    semantic_subdomain:sem.subdomain_label ?? sem.subdomain,semantic_topic:sem.topic_label ?? sem.topic,semantic_basis:sem.basis,question_plain:sem.question_plain})) {
    if (value != null && !own(node,field)) node[field] = field === 'semantic_domain' ? upper(value) : value;
  }
  if (key === 'campaigns' && !node.campaign_id) node.campaign_id = row.id;
  if (key === 'roadmaps' && !node.roadmap_id) node.roadmap_id = row.id;
  if (!own(node,'status_group')) node.status_group = rowStatus(row);
  if (!own(node,'automation_eligible') && typeof row.automation?.eligible === 'boolean') node.automation_eligible = row.automation.eligible;
  if (!own(node,'automation_reason') && typeof row.automation?.reason === 'string') node.automation_reason = row.automation.reason;
  return node;
}

function evolutionOf(records,ctx) {
  const raw = object(records.evolution) ? records.evolution : {};
  const files = Object.fromEntries(Object.entries(raw).map(([name,value]) => [name.replace(/^.*\//,'').replace(/\.json$/i,''),value]));
  const base = object(records.snapshot?.evolution) ? {...records.snapshot.evolution} : object(files.evolution) ? {...files.evolution} : {};
  const arrayFields = new Set(['roadmaps','charters','thoughts','signal_clusters','incidents','board','families']);
  for (const key of ['gate','review_queue','roadmaps','genome','decoys','charters','thoughts','signal_clusters','incidents','reviews','watchdog','board','families','learning','search_space','autonomy','recipe_health','execution_integrity']) {
    if (own(base,key) || !own(files,key)) continue;
    const file = files[key];
    base[key] = own(file,key) ? file[key] : arrayFields.has(key) && Array.isArray(file?.items) ? file.items : file;
  }
  const tests = list(records.tests),roadmaps = list(records.roadmaps);
  const testsKnown = ['AVAILABLE','EMPTY'].includes(collectionCoverage(records,'tests',tests.length,ctx.sourceRef).state);
  const roadmapsKnown = ['AVAILABLE','EMPTY'].includes(collectionCoverage(records,'roadmaps',roadmaps.length,ctx.sourceRef).state);
  const derived = {};
  if (object(base.genome?.genes)) base.genome = {...base.genome,genes:Object.entries(base.genome.genes).map(([id,value]) => ({...(object(value)?value:{canonical:value}),id}))};
  // These are the canonical evolution.py field/count rules, with unavailable
  // inputs left absent and no clock-dependent conclusions or private filtering.
  const gate = object(base.gate) ? {...base.gate} : {};
  if (!own(gate,'charters_waiting') && roadmapsKnown) {
    gate.charters_waiting = roadmaps.filter(row => row.charter?.status === 'PROPOSED').map(row => ({...row.charter,roadmap_id:identity(row,'roadmap')}));
    derived.charters_waiting = 'roadmaps[].charter.status';
  }
  if (!own(gate,'canaries_waiting') && Array.isArray(base.genome?.genes)) {
    gate.canaries_waiting = base.genome.genes.filter(gene => gene.status === 'CANARY').map(gene => ({...gene,gene:gene.id,canary:gene.canary,since:gene.canary_since ?? null}));
    derived.canaries_waiting = 'evolution/genome.json:genes[].status';
  }
  if (Object.keys(gate).length) base.gate = gate;
  if (!base.charters && roadmapsKnown) base.charters = roadmaps.filter(row => object(row.charter)).map(row => ({...row.charter,roadmap_id:identity(row,'roadmap')}));
  const positive = tests.filter(row => ['PROMOTED','SUPPORTED'].includes(upper(row.verdict)) && !row.decoy);
  if (!base.review_queue && testsKnown) {
    const candidates = positive.filter(row => !row.contests_test_id && upper(first(row.state,row.status)) !== 'ARCHIVED' && !['CONFIRMED','REFUTED','ARCHIVED'].includes(row.review_state))
      .sort((a,b) => text(first(a.executed_at,a.updated_at)).localeCompare(text(first(b.executed_at,b.updated_at))) || identity(a,'test').localeCompare(identity(b,'test')));
    const firstQueue = candidates.filter(row => ['PENDING_REVIEW','CONTESTED'].includes(row.review_state) || (row.review_state === 'REFEREE1_PASSED' && list(row.contests).length < 1));
    const testMap = new Map(tests.map(row => [identity(row,'test'),row]));
    const waiting = firstQueue.filter(row => list(row.contests).some(contest => !['INCONCLUSIVE','INCONCLUSIVO'].includes(upper(testMap.get(contest.contest_test_id)?.verdict)))).map(row => identity(row,'test'));
    base.review_queue = {referee_1:firstQueue.filter(row => !waiting.includes(identity(row,'test'))).map(row => identity(row,'test')),
      referee_2:candidates.filter(row => row.review_state === 'REFEREE1_PASSED').map(row => identity(row,'test')),waiting_on_existing_contest:waiting,
      unavailable_review_state:positive.filter(row => !row.review_state).map(row => identity(row,'test'))};
    derived.review_queue = 'Declared positive verdict and review_state; missing review_state is not silently assigned PENDING_REVIEW.';
  }
  if (!base.reviews && testsKnown) {
    base.reviews = Object.fromEntries(['PENDING_REVIEW','CONTESTED','REFEREE1_PASSED','CONFIRMED','REFUTED'].map(status => [status,positive.filter(row => row.review_state === status).length]));
    derived.reviews = 'Counts of declared review_state among non-decoy PROMOTED/SUPPORTED tests.';
  }
  if (!base.roadmaps && roadmapsKnown && testsKnown) {
    base.roadmaps = roadmaps.map(roadmap => {
      const id = identity(roadmap,'roadmap'),charter = object(roadmap.charter) ? roadmap.charter : {},since = text(charter.chartered_at);
      const mine = tests.filter(row => row.roadmap_id === id && !row.decoy);
      const counted = mine.filter(row => !since || text(row.executed_at) >= since);
      const executed = counted.filter(row => row.verdict).sort((a,b) => text(a.executed_at).localeCompare(text(b.executed_at)));
      const confirmed = counted.filter(row => row.review_state === 'CONFIRMED').length;
      let streak = 0;
      for (const row of [...executed].reverse()) { if (row.review_state === 'REFUTED' || ['REJECTED','FALSIFIED'].includes(upper(row.verdict))) streak++; else break; }
      const budget = charter.budget || {},stop = charter.stop || {};
      const success = number(stop.success_confirmed),kill = number(stop.kill_consecutive_refuted),max = number(budget.max_tests);
      const stopReached = charter.status !== 'CHARTERED' ? null : success > 0 && confirmed >= success ? 'SUCCESS' : kill > 0 && streak >= kill ? 'KILL' : !charter.renewable && max > 0 && executed.length >= max ? 'BUDGET' : null;
      return {roadmap_id:id,campaign_id:roadmap.campaign_id ?? null,state:first(roadmap.state,roadmap.status),charter_status:charter.status ?? null,
        confirmed,success_target:success,tests_used:executed.length,max_tests:max,tests_total:mine.length,
        frontier_count:Array.isArray(roadmap.frontier_refs) ? roadmap.frontier_refs.length : Array.isArray(roadmap.frontier_test_ids) ? roadmap.frontier_test_ids.length : null,
        ready:mine.filter(row => upper(first(row.state,row.status)) === 'READY').length,resumable:mine.filter(row => ['RUNNING','CHECKPOINTED'].includes(upper(first(row.state,row.status)))).length,
        days:null,max_days:number(budget.max_days),refuted_streak:streak,kill_streak:kill,stop_reached:stopReached,renewable:typeof charter.renewable === 'boolean' ? charter.renewable : null,review_due:null};
    });
    derived.roadmaps = 'evolution.roadmap_progress: counts of declared source verdict/review states; no clock-based budget or review decision.';
  }
  if (Array.isArray(base.decoys?.planted) && Array.isArray(base.decoys?.revealed)) {
    const decoys = base.decoys;
    base.decoys = {planted:decoys.planted.length,revealed:decoys.revealed.length,caught:decoys.revealed.every(row => typeof row.caught === 'boolean') ? decoys.revealed.filter(row => row.caught).length : null};
    derived.decoys = 'Lengths of canonical planted/revealed arrays; caught is counted only when each reveal explicitly declares it.';
  }
  if (Array.isArray(files.batteries?.batteries) && !base.batteries) {
    base.batteries = Object.fromEntries(['QUEUED','DISPATCH_PENDING','DISPATCHED','RUNNING','DONE'].map(status => [status,files.batteries.batteries.filter(row => row.status === status).length]));
    derived.batteries = 'Counts by canonical battery status.';
  }
  if (Array.isArray(base.thoughts?.entries)) base.thoughts = base.thoughts.entries;
  if (Array.isArray(base.board?.posts)) base.board = base.board.posts;
  if (Array.isArray(base.thoughts)) base.thoughts = base.thoughts.map(row => ({...row,refs:list(row.refs),...(Array.isArray(row.refs) ? {} : {unavailable_fields:['refs']})}));
  if (object(base.recipe_health?.recipes)) base.recipe_health = Object.fromEntries(Object.entries(base.recipe_health.recipes).filter(([,row]) => row.state === 'OPEN'));
  if (object(base.families) && testsKnown) base.families = Object.entries(base.families).map(([id,family]) => {
    const mine = tests.filter(row => row.family_id === (family.family_id ?? id));
    return {...family,family_id:family.family_id ?? id,display_name:first(family.display_name,family.template?.display_name),cells:Array.isArray(family.instances) ? family.instances.length : null,tests:mine.length,
      done:mine.filter(row => row.verdict).length,promoted:mine.filter(row => upper(row.verdict) === 'PROMOTED').length,rejected:mine.filter(row => upper(row.verdict) === 'REJECTED').length,inconclusive:mine.filter(row => upper(row.verdict) === 'INCONCLUSIVE').length};
  });
  const unavailableFields = [];
  for (const key of ['thoughts','board','signal_clusters','incidents','families','charters']) if (base[key] != null && !Array.isArray(base[key])) { base[key] = null;unavailableFields.push(key); }
  if (base.learning != null && !Array.isArray(base.learning?.rules)) {base.learning = null;unavailableFields.push('learning');}
  if (Array.isArray(base.signal_clusters)) base.signal_clusters = base.signal_clusters.map(row => ({...row,sources:list(row.sources),topic_ids:list(row.topic_ids),test_ids:list(row.test_ids)}));
  const complete = object(base.gate) && Array.isArray(base.gate.charters_waiting) && Array.isArray(base.gate.canaries_waiting)
    && object(base.review_queue) && Array.isArray(base.review_queue.referee_1) && Array.isArray(base.review_queue.referee_2)
    && Array.isArray(base.roadmaps) && object(base.genome) && number(base.genome.generation) !== null && Array.isArray(base.genome.genes)
    && object(base.decoys) && ['planted','revealed','caught'].every(key => number(base.decoys[key]) !== null);
  base.source_coverage = {tests:testsKnown,roadmaps:roadmapsKnown,files:Object.keys(files),derivations:derived,unavailable_fields:unavailableFields};
  return {value:complete ? base : null,partial:base,availability:complete ? {state:'AVAILABLE',source_ref:ctx.sourceRef}
    : {...unavailable('A fonte não contém todos os campos canônicos necessários ao contrato evolution; campos presentes são preservados em evolution_partial e read_model.evolution.',ctx.sourceRef),state:Object.keys(base).some(key => key !== 'source_coverage') ? 'PARTIAL' : 'UNAVAILABLE',available_fields:Object.keys(base).filter(key => key !== 'source_coverage')}};
}
function guardianOf(records,ctx) {
  const reportOf = raw => object(raw?.payload) ? raw.payload : object(raw?.guardian) ? raw.guardian : object(raw?.integrity) ? raw.integrity : raw;
  const artifacts = list(records.artifacts).filter(row => /(?:GUARDIAN|GUARDIAO|INTEGRITY)/i.test([row.kind,row.contract,row.id,row.payload?.contract].filter(Boolean).join(' ')) && validDate(reportOf(row)?.checked_at))
    .sort((a,b) => Date.parse(reportOf(b).checked_at) - Date.parse(reportOf(a).checked_at));
  const declared = first(records.integrity,records.snapshot?.guardian,records.snapshot?.integrity);
  const raw = reportOf(declared)?.status ? declared : artifacts[0] ?? declared;
  const value = reportOf(raw);
  const valid = object(value) && ['GREEN','YELLOW','RED'].includes(value.status) && validDate(value.checked_at)
    && number(value.checks_total) !== null && number(value.checks_failing) !== null && Array.isArray(value.failing_areas);
  return {value:valid ? value : null,availability:valid ? {state:'AVAILABLE',source_ref:refOf(ctx.sourceRef,raw,'indexes/integrity-latest.json')}
    : unavailable('Relatório canônico do Guardião ausente ou incompleto; saúde não inferida.',ctx.sourceRef)};
}

function cosmologyOf(records,ctx) {
  const value = records.cosmologyState;
  const valid = object(value) && value.model === 'COSMOLOGY_STATE_V1' && value.authority === 'TOWER' && value.projection_only === true && Array.isArray(value.frontiers) && Array.isArray(value.historical_tests)
    && value.frontiers.every(frontier => object(frontier) && text(frontier.id) && ['SOLID','TENSION','OPEN'].includes(frontier.state)
      && ['key_evidence','historical_lessons','campaign_ids','roadmap_ids','open_questions','next_discriminants','active_tests','synthesis_evidence_ids','nexo_interpretation'].every(key => Array.isArray(frontier[key])) && object(frontier.evidence_counts));
  return {value:valid ? value : null,availability:valid ? {state:'AVAILABLE',source_ref:refOf(ctx.sourceRef,value,'snapshot/cosmology_state.json')}
    : unavailable('Snapshot COSMOLOGY_STATE_V1 completo indisponível; baseline ou overrides não são conclusões globais.',ctx.sourceRef)};
}

function compileRuns(records,ctx,actions) {
  const declared = first(records.runs,records.snapshot?.runs,records.evolution?.['runs.json'],records.evolution?.runs);
  const runs = list(Array.isArray(declared) ? declared : declared?.runs),seen = new Set();
  const workActions = new Map(actions.map(action => [action.id,action.action_id]));
  return runs.filter(object).map(row => {
    const id = text(first(row.run_id,row.id));
    if (!id || seen.has(id)) reject('RUN_ID_INVALID');seen.add(id);
    const rawStatus = upper(row.status),readback = readbackOf(row);
    return {...row,run_id:id,action_id:text(first(row.action_id,workActions.get(row.work_id),row.work_id)) || 'UNKNOWN',lane:domainOf(row),title:labelOf(row,id),
      started_at:first(row.started_at),ended_at:first(row.ended_at),status:['RUNNING','BLOCKED','FAILED','NO_OP'].includes(rawStatus) ? rawStatus : rawStatus === 'SUCCEEDED' && readback.status === 'CONFIRMED' ? rawStatus : 'UNKNOWN',
      canonical_status:first(row.status),effect_key:first(row.effect_key),capability_id:first(row.capability_id),runtime:RUNTIMES.has(upper(row.runtime)) ? upper(row.runtime) : 'UNKNOWN',
      retries:number(row.retries),receipt_ref:first(row.receipt_ref),steps:list(row.steps),readback,...provenanceOf(ctx,row,`evolution/runs.json/${id}`)};
  });
}

function graphAndFilaments(rows,capabilities,ctx) {
  const nodes = COLLECTIONS.flatMap(key => rows[key].map(row => graphNode(row,key,ctx)));
  for (const cap of capabilities) nodes.push({...graphNode({...cap,id:cap.capability_id},'artifacts',ctx),source_ref:cap.source_ref,fingerprint:cap.fingerprint,source_revision:cap.source_revision,id:`capability:${cap.capability_id}`,canonical_id:cap.capability_id,type:'CAPABILITY',state:cap.status,capability_id:cap.capability_id});
  const byId = new Map(nodes.map(node => [node.id,node]));
  const aliases = new Map();
  const alias = (key,node) => { if (!key) return; const prior = aliases.get(key); aliases.set(key,aliases.has(key) && prior !== node.id ? null : node.id); };
  for (const node of nodes) { alias(node.id,node); alias(node.canonical_id,node); alias(node.source_ref.split('#')[1],node); }
  const resolve = (value,kind) => {
    const raw = object(value) ? first(value.id,value.ref,value.path,value.entity_id) : value;
    if (typeof raw !== 'string') return null;
    const clean = raw.replace(/^TOWER_V\d+\//,'');
    return (kind && byId.has(`${kind}:${raw}`) ? `${kind}:${raw}` : aliases.get(raw) || aliases.get(clean) || aliases.get(raw.split('#').at(-1))) ?? null;
  };
  const edges = [],unresolved = [],seen = new Set();
  const edge = (from,to,kind,explanation,extra={}) => {
    if (!from || !to || !byId.has(from) || !byId.has(to)) { unresolved.push({from,to,kind,explanation,...extra}); return; }
    if (from === to) return;
    const id = `edge:${digest({from,to,kind,learning_ref:extra.learning_ref ?? null}).slice(7)}`;
    if (seen.has(id)) return;
    seen.add(id);edges.push({id,from,to,kind,weight:1,explanation,...extra});
  };
  const domains = uniq([...CORE_DOMAINS,...nodes.map(node => node.domain),...rows.interdomain.flatMap(row => [...strings(row.source_domains),...strings(row.target_domains)])]);
  for (const domain of domains) {
    const node = {id:`domain:${domain}`,canonical_id:domain,type:'DOMAIN',label:domain,domain,state:'SNAPSHOT',authority_class:'DERIVED',...provenanceOf(ctx,{},'control.json'),summary:'Agrupamento de registros canônicos; não é uma declaração de saúde.'};
    nodes.unshift(node);byId.set(node.id,node);
  }
  for (const node of nodes.filter(node => node.type !== 'DOMAIN')) edge(`domain:${node.domain}`,node.id,'OWNS','Agrupamento pelo domínio declarado na fonte.');
  for (const key of COLLECTIONS) for (const row of rows[key]) {
    const from = `${KIND[key]}:${row.id}`;
    for (const [field,kind,relation] of [['campaign_id','campaign','OWNS'],['roadmap_id','roadmap','OWNS'],['hypothesis_id','hypothesis','VERIFIES'],['test_id','test','PRODUCES'],['capability_id','capability','DEPENDS_ON']]) {
      const reference = first(row[field],field === 'hypothesis_id' ? row.hypothesis_ref : null);
      if (!reference) continue;
      const target = resolve(reference,kind);
      if (relation === 'OWNS') edge(target,from,relation,`${field} declarado na fonte.`,{source_ref:refOf(ctx.sourceRef,row,''),source_reference:reference});
      else edge(from,target,relation,`${field} declarado na fonte.`,{source_ref:refOf(ctx.sourceRef,row,''),source_reference:reference});
    }
    for (const field of ['parents','depends_on','derived_from','source_refs','evidence_refs','test_refs','lesson_refs','source_nodes','target_nodes','test_ids','hypothesis_ids','children']) for (const ref of list(row[field])) {
      const target = resolve(ref,field === 'test_ids' || field === 'test_refs' ? 'test' : field === 'hypothesis_ids' ? 'hypothesis' : field === 'lesson_refs' ? 'lesson' : null);
      const relation = ['test_ids','hypothesis_ids','children'].includes(field) ? 'OWNS' : field === 'depends_on' ? 'DEPENDS_ON' : 'DERIVES_FROM';
      edge(from,target,relation,`${field} declarado na fonte.`,{source_reference:ref,...(key === 'lessons' && target ? {is_learning:true,learning_ref:row.id,learning_scope:byId.get(from).domain === byId.get(target).domain ? 'INTRA_DOMAIN' : 'INTER_DOMAIN'} : {})});
    }
  }
  const filaments = [];
  for (const [key,row] of [...rows.lessons.map(row => ['lessons',row]),...rows.interdomain.map(row => ['interdomain',row])]) {
    const ownId = `${KIND[key]}:${row.id}`;
    const fromRaw = first(row.from_id,row.source_id,list(row.source_nodes)[0]);
    const toRaw = first(row.to_id,row.target_id,list(row.target_nodes)[0]);
    const evidence = uniq([...strings(row.evidence),...strings(row.evidence_refs),...strings(row.test_refs),...strings(row.lesson_refs),...strings(row.learning_refs)]);
    const resolvedEvidence = evidence.map(value => resolve(value)).filter(Boolean);
    const declaredFromDomain = first(row.from_domain,row.source_domain,list(row.source_domains)[0]);
    const declaredToDomain = first(row.to_domain,row.target_domain,list(row.target_domains)[0]);
    const from = resolve(fromRaw) || (key === 'lessons' ? ownId : byId.has(`domain:${declaredFromDomain}`) ? `domain:${declaredFromDomain}` : null);
    const to = resolve(toRaw) || (key === 'lessons' ? resolvedEvidence[0] : byId.has(`domain:${declaredToDomain}`) ? `domain:${declaredToDomain}` : null);
    const fromDomain = text(first(row.from_domain,row.source_domain,list(row.source_domains)[0],byId.get(from)?.domain,row.domain)) || 'UNKNOWN';
    const toDomain = text(first(row.to_domain,row.target_domain,list(row.target_domains)[0],byId.get(to)?.domain)) || 'UNKNOWN';
    const rawStatus = upper(row.status);
    const filament = {...row,id:row.id,label:labelOf(row,row.id),domain:fromDomain,kind:['SEMANTIC','PROCEDURAL','SCIENTIFIC_LEARNING_PIPELINE'].includes(row.kind) ? row.kind : key === 'lessons' ? 'PROCEDURAL' : 'SEMANTIC',
      weight:number(first(row.weight,row.confidence)),support:number(first(row.support,row.support_count,row.supporting_count)),contradiction:number(first(row.contradiction,row.contradiction_count,row.contradicting_count)),
      status:['ESTABLISHED','PROVISIONAL','TESTING','CONTESTED','RETIRED'].includes(rawStatus) ? rawStatus : ['SUPPORTED','ACTIVE','ADMIT'].includes(rawStatus) ? 'ESTABLISHED' : ['REJECTED','CONTRADICTED'].includes(rawStatus) ? 'CONTESTED' : rawStatus === 'RETIRED' ? 'RETIRED' : 'UNKNOWN',
      canonical_status:first(row.status),evidence,source_ref:refOf(ctx.sourceRef,row,`entities/${KIND[key]}/${row.id}.json`),
      boundary:text(first(row.boundary,row.claim_boundary,row.falsifier_or_validation,row.falsifier)) || 'Limite de aplicação não informado pela fonte.',
      from_label:text(first(row.from_label,byId.get(from)?.label,fromRaw)) || fromDomain,to_label:text(first(row.to_label,byId.get(to)?.label,toRaw)) || toDomain,
      from_id:from || fromRaw || null,to_id:to || toRaw || null,from_domain:fromDomain,to_domain:toDomain,
      scope:fromDomain === 'UNKNOWN' || toDomain === 'UNKNOWN' ? null : fromDomain === toDomain ? 'INTRA_DOMAIN' : 'INTER_DOMAIN',
      learning_refs:uniq([...strings(row.learning_refs),...strings(row.lesson_refs)]),
      links:uniq([from,to,...resolvedEvidence].filter(Boolean)).map(id => ({id,domain:byId.get(id).domain,label:byId.get(id).label})),observed_at:first(row.observed_at,row.updated_at),
      unavailable_fields:['weight','support','contradiction'].filter(field => number(first(row[field],field === 'weight' ? row.confidence : field === 'support' ? row.support_count ?? row.supporting_count : row.contradiction_count ?? row.contradicting_count)) === null)};
    const declaredSources = uniq([from,...list(row.source_nodes).map(value => resolve(value)),...(key === 'interdomain' && !row.source_nodes?.length ? strings(row.source_domains).map(value => `domain:${value}`) : [])].filter(id => byId.has(id)));
    const declaredTargets = uniq([to,...list(row.target_nodes).map(value => resolve(value)),...(key === 'interdomain' && !row.target_nodes?.length ? strings(row.target_domains).map(value => `domain:${value}`) : [])].filter(id => byId.has(id)));
    filament.links = uniq([...declaredSources,...declaredTargets,...resolvedEvidence]).map(id => ({id,domain:byId.get(id).domain,label:byId.get(id).label}));
    filaments.push(filament);
    for (const source of declaredSources) for (const target of declaredTargets) edge(source,target,'DERIVES_FROM',filament.boundary,{is_learning:true,learning_scope:byId.get(source).domain === byId.get(target).domain ? 'INTRA_DOMAIN' : 'INTER_DOMAIN',learning_ref:filament.id,weight:filament.weight ?? 1,weight_basis:filament.weight === null ? 'PRESENTATION_ONLY' : 'CANONICAL'});
  }
  return {graph:{nodes,edges},filaments,unresolved_relations:unresolved};
}

/** Compile only already-normalized records from an authenticated, verified read. */
export function compilePrivateTowerSystem({records,revision,generatedAt,sourceRef} = {}) {
  if (!object(records) || !/^sha256:[a-f0-9]{64}$/.test(text(revision)) || !validDate(generatedAt) || !text(sourceRef)) reject('GENERATION_INVALID');
  const input = structuredClone(records),ctx = {revision,generatedAt,sourceRef},rows = normalizeCollections(input);
  const capabilities = capabilitiesOf(input,ctx);
  // WORK is a read-only operational record, not by itself an executable action.
  const actionRows = rows.work.filter(row => humanGate(row) || text(row.action_id) || ['ACTION','ACTION_RECORD','NEXO_ACTION_V1'].includes(row.kind) || (OPERATIONS.has(upper(row.required_operation)) && RUNTIMES.has(upper(row.runtime))));
  const actions = actionRows.map(row => actionOf(row,ctx)),inbox = actionRows.map((row,index) => inboxOf(actions[index],row,ctx)).filter(Boolean);
  const evolution = evolutionOf(input,ctx),guardian = guardianOf(input,ctx),cosmology = cosmologyOf(input,ctx);
  for (const [group,field,kind] of [['charters_waiting','roadmap_id','APROVAR'],['canaries_waiting','gene','DECIDIR']]) {
    for (const gate of list(evolution.partial.gate?.[group])) {
      const id = text(gate[field]);if (!id) continue;
      const roadmap = rows.roadmaps.find(row => row.id === id);
      inbox.push({id:`evolution:${group}:${id}`,kind,domain:roadmap ? domainOf(roadmap) : 'NEXO',title:text(first(gate.question,roadmap?.title)) || id,
        question:text(gate.question) || 'Decisão humana pendente no registro canônico.',why:'Gate humano explicitamente registrado na Tower.',action_id:null,options:list(gate.options),severity:'INFO',due_at:first(gate.due_at),
        ...provenanceOf(ctx,gate,group === 'charters_waiting' ? `roadmaps/${id}.json` : 'evolution/genome.json')});
    }
  }
  let historical = list(cosmology.value?.historical_tests).map((row,index) => ({...row,id:identity(row,'test'),historical:true,_source_path:text(cosmology.value?._source_path) || 'snapshot/cosmology_state.json',_source_pointer:`/historical_tests/${index}`}));
  const testIds = new Set(rows.tests.map(row => row.id));
  if (cosmology.value) {
    const allIds = new Set([...testIds,...historical.map(row => row.id)]);
    if (historical.some(row => !row.id) || new Set(historical.map(row => row.id)).size !== historical.length || cosmology.value.frontiers.some(frontier => [...frontier.key_evidence.flatMap(item => [item?.id,...list(item?.member_ids)]),...frontier.historical_lessons.flatMap(item => [item?.id,...list(item?.member_ids)]),...frontier.active_tests.map(item => item?.id),...frontier.synthesis_evidence_ids,...frontier.nexo_interpretation.flatMap(item => list(item?.evidence_ids))].some(id => !allIds.has(id)))) {
      cosmology.value = null;historical = [];cosmology.availability = unavailable('Referência de evidência cosmológica ausente dos testes atuais e históricos canônicos.',sourceRef);
    }
  }
  historical = historical.filter(row => row.id && !testIds.has(row.id));
  const {graph,filaments,unresolved_relations} = graphAndFilaments(rows,capabilities,ctx);
  const availability = Object.fromEntries(COLLECTIONS.map(key => [key,collectionCoverage(input,key,rows[key].length,sourceRef)]));
  availability.capabilities = collectionCoverage(input,'capabilities',capabilities.length,sourceRef);
  availability.evolution = evolution.availability;availability.guardian = guardian.availability;availability.cosmology_state = cosmology.availability;
  const incomplete = ['work','tests','hypotheses','campaigns','roadmaps','capabilities'].some(key => !['AVAILABLE','EMPTY'].includes(availability[key].state));
  const state = incomplete ? 'DEGRADED' : 'SNAPSHOT';
  const domains = uniq([...CORE_DOMAINS,...graph.nodes.map(node => node.domain)]);
  const lanes = domains.map(domain => {
    const ownActions = actions.filter(action => action.lane === domain),members = graph.nodes.filter(node => node.domain === domain && node.type !== 'DOMAIN');
    const ownWork = rows.work.filter(row => domainOf(row) === domain);
    const active = ownActions.find(action => !TERMINAL.has(action.canonical_status));
    const activeWork = ownWork.find(row => !TERMINAL.has(upper(rowStatus(row))));
    const blockers = ownWork.filter(row => /^BLOCKED(?:_|$)/.test(upper(rowStatus(row)))).map(row => text(row.blocker) || labelOf(row,row.id));
    return {domain,current_state:active ? `${active.canonical_status}: ${active.title}` : activeWork ? `${rowStatus(activeWork)}: ${labelOf(activeWork,activeWork.id)}` : members.length ? `${members.length} registros canônicos disponíveis.` : incomplete ? 'Registros deste domínio não estabelecidos pela fonte.' : 'Nenhum registro deste domínio na geração canônica fornecida.',
      next_action:active?.next_action || text(activeWork?.next_action) || 'Próxima ação não informada pela fonte.',last_effect:null,blockers:uniq(blockers),side_quests:[],
      state:members.length ? blockers.length ? 'BLOCKED' : 'SNAPSHOT' : incomplete ? 'MISSING_PROVIDER' : 'SNAPSHOT',...provenanceOf(ctx,{},'control.json')};
  });
  for (const node of graph.nodes.filter(node => node.type === 'DOMAIN')) node.state = lanes.find(lane => lane.domain === node.domain).state;
  const findings = lanes.map(lane => ({id:`source:${lane.domain}`,domain:lane.domain,status:lane.state === 'MISSING_PROVIDER' ? 'MISSING_PROVIDER' : 'SNAPSHOT',...provenanceOf(ctx,{},'control.json'),
    authority:{owner:'TOWER_V06',class:'DERIVED'},provider:{expected:'TOWER_V06',observed:lane.state === 'MISSING_PROVIDER' ? null : 'TOWER_V06'},capability:null,severity:'INFO',
    explanation:lane.state === 'MISSING_PROVIDER' ? 'Não há conteúdo canônico suficiente para declarar o estado deste domínio.' : 'Snapshot privado de registros canônicos. Saúde e êxito de execução não são inferidos.'}));
  const envelope = {entity_id:'NEXO_ATLAS_PRIVATE_SYSTEM_V1',domain:'NEXO',authority_class:'DERIVED',...provenanceOf(ctx,{},''),state,projection_role:'ATLAS',authoritative:false,
    derivation_rule:'PRIVATE_TOWER_RECORDS_V1; read-only field mapping; original records retained; no public sanitizer.',title:'Atlas privado · Tower',summary:'Projeção privada da geração canônica indicada.'};
  const activity = list(input.events).map(event => ({...event,at:first(event.at,event.timestamp,event.created_at),event_type:text(first(event.event_type,event.type,event.kind)) || 'UNKNOWN',role:text(first(event.role,event.actor_role,event.actor)) || 'UNKNOWN',entity_id:first(event.entity_id,event.entity_name,event.entity_ref,event.test_id,event.work_id)}));
  const modelRecords = key => Object.fromEntries(rows[key].map(row => [row.id,row]));
  return {contract_version:'1',access:'PRIVATE',scenario_id:'private-tower',scenario_label:'Tower · Atlas privado',generated_at:generatedAt,source_revision:revision,global_state:state,
    bus:{fingerprint:revision,generated_at:generatedAt,state,envelope_count:1,sources:[{id:'tower_v06',label:'Tower privado',source_revision:revision,freshness:unknownFreshness(generatedAt),state,envelopes:1}],
      consumers:[{id:'nexo_one',label:'NEXO ONE',state,last_pull_at:null},{id:'atlas',label:'Atlas',state,last_pull_at:null}]},
    envelopes:[envelope],findings,actions,inbox,capabilities,runs:compileRuns(input,ctx,actions),lanes,projected_work:graph.nodes.filter(node => node.type === 'ACTION'),graph,filaments,
    providers:[{id:'tower_v06',label:'Tower privado',expected_for:domains,state,capabilities:capabilities.map(capability => capability.capability_id),last_success_at:null,checked_at:generatedAt,
      explanation:'Snapshot canônico privado; o horário é o updated_at da Tower, não uma sondagem de saúde dos providers.',availability:incomplete ? 'PARTIAL' : 'AVAILABLE'}],
    science_projection_v1:{contract:'NEXO_SCIENCE_PROJECTION_V1',version:1,access:'PRIVATE',source:{authority:'TOWER_V06',tower_repository:null,tower_commit:null,tower_revision:revision,
      projection_fingerprint:revision,projection_ref:sourceRef,writeback:'FORBIDDEN'},fingerprint:revision,
      campaigns:rows.campaigns.map(row => scienceRecord(row,'campaign',ctx)),hypotheses:rows.hypotheses.map(row => scienceRecord(row,'hypothesis',ctx)),tests:rows.tests.map(row => scienceRecord(row,'test',ctx)),historical_tests:historical.map(row => scienceRecord(row,'test',ctx))},
    read_model:{version:1,access:'PRIVATE',source_ref:sourceRef,source_revision:revision,tests:Object.fromEntries(rows.tests.filter(row => !row.historical).map(row => [row.id,{...row,...(row.hypothesis_id == null && row.hypothesis_ref != null ? {hypothesis_id:row.hypothesis_ref} : {})}])),
      historical_tests:Object.fromEntries([...historical,...rows.tests.filter(row => row.historical)].map(row => [row.id,row])),hypotheses:modelRecords('hypotheses'),roadmaps:rows.roadmaps.map(row => ({...row,roadmap_id:text(first(row.roadmap_id,row.id))})),
      work:modelRecords('work'),campaigns:modelRecords('campaigns'),lessons:modelRecords('lessons'),interdomain:modelRecords('interdomain'),artifacts:modelRecords('artifacts'),activity,
      evolution:input.evolution ?? null,integrity:input.integrity ?? null,cosmology_baseline:input.cosmologyBaseline ?? null,cosmology_source:input.cosmologyState ?? null,coverage:input.coverage ?? null},
    evolution:evolution.value,evolution_partial:evolution.value ? null : evolution.partial,guardian:guardian.value,cosmology_state:cosmology.value,availability,unresolved_relations};
}
