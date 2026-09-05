const ACTIVE_ROLE_ORDER = ['NEXO Continuity', 'NEXO Scientific Core', 'NEXO Executor'];
const HISTORICAL_ROLE_ORDER = ['NEXO Journal', 'NEXO Guardian'];
const LANE_ORDER = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'];

const CAPABILITY_SNAPSHOT = [
  { id: 'CAP-GCAL-SCHEDULED-WRITE', domain: 'ENGINEERING/OLYMPUS', status: 'PASS', label: 'Calendar scheduled write', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-GDRIVE-SCHEDULED-SHEET', domain: 'NEXO', status: 'PASS', label: 'Drive scheduled write/readback', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-GITHUB-SCHEDULED-READ', domain: 'ENGINEERING', status: 'PASS', label: 'GitHub scheduled read', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-GITHUB-SCHEDULED-WRITE', domain: 'ENGINEERING', status: 'UNVERIFIED', label: 'GitHub scheduled write', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-VERCEL-SCHEDULED-READ', domain: 'ENGINEERING', status: 'PASS', label: 'Vercel scheduled read', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-SCIENCE-SCHEDULED-RESUME', domain: 'SCIENCE', status: 'PENDING_REAL_ACTION', label: 'Science scheduled resume', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-OLYMPUS-ANTICIPATORY-E2E', domain: 'OLYMPUS', status: 'PASS', label: 'Olympus anticipatory E2E', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-EFFECT-EXACTLY-ONCE', domain: 'NEXO', status: 'PASS', label: 'Exactly-once effect semantics', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-NEON-NEXO-OPS-SCHEDULED-WRITE', domain: 'NEXO', status: 'PASS', label: 'Neon projection scheduled write', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-CAMB-DRIVE-INTERACTIVE-EXEC', domain: 'SCIENCE', status: 'PASS', label: 'Portable CAMB interactive execution', evidence: 'CAPABILITY_MATRIX' },
  { id: 'CAP-CAMB-SCHEDULED-INVOKE', domain: 'SCIENCE', status: 'PENDING_REAL_ACTION', label: 'CAMB scheduled invocation', evidence: 'CAPABILITY_MATRIX' }
];

const EVOLUTION_SNAPSHOT = [
  {
    id: 'runtime-consolidation',
    label: 'Runtime architecture',
    before: '5 tasks',
    after: '3 tasks',
    delta: '-40%',
    state: 'PROVEN',
    source: 'STATE_INDEX / ARCHITECTURE_CONSOLIDATION'
  },
  {
    id: 'prompt-compaction',
    label: 'Active prompt footprint',
    before: '40,452 chars',
    after: '18,910 chars',
    delta: '-53.3%',
    state: 'PROVEN',
    source: 'STATE_INDEX / Runtime + tool-call optimization v1'
  },
  {
    id: 'hotstate-toolcalls',
    label: 'Hot-state tool calls',
    before: 'median 14',
    after: 'shadow 1/20',
    delta: 'COLLECTING BASELINE',
    state: 'COLLECTING_BASELINE',
    source: 'VALUE_METRICS / TOWER_HOTSTATE_SQL_BASELINE_V1'
  }
];

function chooseDatabaseUrl(env = {}) {
  for (const key of ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL']) {
    if (typeof env[key] === 'string' && env[key].trim()) return { key, value: env[key].trim() };
  }
  return null;
}

function deriveSync(syncRows = [], now = new Date()) {
  const valid = syncRows
    .filter(row => row && row.last_synced_at)
    .sort((a, b) => new Date(b.last_synced_at) - new Date(a.last_synced_at));
  if (!valid.length) return { state: 'DEGRADED', ageMinutes: null, lastSyncedAt: null };
  const latest = valid[0];
  const ageMinutes = Math.max(0, Math.round((now - new Date(latest.last_synced_at)) / 60000));
  const status = String(latest.sync_status || '').toUpperCase();
  const failed = ['ERROR', 'FAILED', 'DEGRADED'].some(x => status.includes(x));
  const state = failed ? 'DEGRADED' : ageMinutes <= 120 ? 'LIVE' : 'STALE';
  return { state, ageMinutes, lastSyncedAt: latest.last_synced_at };
}

function getMaterialEvents(events = []) {
  return events.filter(event => {
    const status = String(event.status || '').toUpperCase();
    const type = String(event.event_type || '').toUpperCase();
    const summary = String(event.summary || '').toUpperCase();
    if (type === 'HEARTBEAT') return false;
    if (status.includes('NO_OP') && !status.includes('MATERIAL')) return false;
    if (summary.includes('NO NEW MATERIAL') || summary.includes('NO_NEW_MATERIAL')) return false;
    return type.includes('MATERIAL') || status.includes('MATERIAL') || type.includes('ARCHITECTURE') || status.includes('CORRECTION') || status.includes('REVIEW');
  });
}

function sortByOrder(rows, order) {
  const byName = new Map(rows.map(row => [row.component, row]));
  return order.map(name => byName.get(name)).filter(Boolean);
}

function shapePayload({ currentState = [], attention = [], runtimeEvents = [], syncRows = [] } = {}, now = new Date()) {
  const roles = sortByOrder(currentState.filter(row => ACTIVE_ROLE_ORDER.includes(row.component)), ACTIVE_ROLE_ORDER);
  const historicalRoles = sortByOrder(currentState.filter(row => HISTORICAL_ROLE_ORDER.includes(row.component)), HISTORICAL_ROLE_ORDER);
  const lanes = sortByOrder(currentState.filter(row => LANE_ORDER.includes(row.component)), LANE_ORDER);
  const materialRuntime = getMaterialEvents(runtimeEvents).slice(0, 18);
  return {
    source: 'NEON_NEXO_OPS',
    lanes,
    roles,
    historicalRoles,
    attention: attention.slice(0, 12),
    runtime: materialRuntime,
    sync: deriveSync(syncRows, now),
    evolution: EVOLUTION_SNAPSHOT,
    capabilities: CAPABILITY_SNAPSHOT,
    architecture: { activeTaskCount: 3, historicalTaskCount: 2 }
  };
}

function fallbackPayload(reason = 'DATABASE_URL_NOT_CONFIGURED') {
  return {
    source: 'EMBEDDED_FALLBACK',
    reason,
    lanes: [
      { component: 'SCIENCE', domain: 'SCIENCE', status: 'READY_CRITICAL', current_action: 'ACT-SCI-PNGB-SPTD1-NATIVE-JOINT-001', checkpoint: 'S33', source_ref: 'STATE_INDEX / nexo_ops snapshot' },
      { component: 'ENGINEERING', domain: 'ENGINEERING', status: 'READY_CRITICAL', current_action: 'ACT-ENG-ASCOM-00323-MAJOR-REV', source_ref: 'STATE_INDEX / nexo_ops snapshot' },
      { component: 'OLYMPUS', domain: 'OLYMPUS', status: 'NO_ACTIVE_ACTION', source_ref: 'STATE_INDEX / nexo_ops snapshot' }
    ],
    roles: [
      { component: 'NEXO Continuity', status: 'ACTIVE', source_ref: 'STATE_INDEX' },
      { component: 'NEXO Scientific Core', status: 'ACTIVE_REVIEW', source_ref: 'STATE_INDEX' },
      { component: 'NEXO Executor', status: 'ACTIVE', source_ref: 'STATE_INDEX' }
    ],
    historicalRoles: [
      { component: 'NEXO Journal', status: 'RETIRED_MERGED', source_ref: 'STATE_INDEX' },
      { component: 'NEXO Guardian', status: 'RETIRED_MERGED', source_ref: 'STATE_INDEX' }
    ],
    attention: [],
    runtime: [],
    sync: { state: 'DEGRADED', ageMinutes: null, lastSyncedAt: null },
    evolution: EVOLUTION_SNAPSHOT,
    capabilities: CAPABILITY_SNAPSHOT,
    architecture: { activeTaskCount: 3, historicalTaskCount: 2 }
  };
}

module.exports = {
  ACTIVE_ROLE_ORDER,
  HISTORICAL_ROLE_ORDER,
  LANE_ORDER,
  CAPABILITY_SNAPSHOT,
  EVOLUTION_SNAPSHOT,
  chooseDatabaseUrl,
  deriveSync,
  getMaterialEvents,
  shapePayload,
  fallbackPayload
};
