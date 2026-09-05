const {
  chooseDatabaseUrl,
  shapePayload,
  fallbackPayload
} = require('../lib/nexo-data');

async function queryDatabase(connectionString) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);

  const [currentState, attention, runtimeEvents, syncRows] = await Promise.all([
    sql`SELECT component, domain, status, current_action, checkpoint, blocker_code, source_kind, source_id, source_ref, source_revision, observed_at, synced_at, payload FROM nexo_ops.current_state ORDER BY component`,
    sql`SELECT item_id, domain, item_type, priority, status, title, action_id, blocker_code, source_kind, source_id, source_ref, observed_at, updated_at, payload FROM nexo_ops.active_attention ORDER BY updated_at DESC LIMIT 40`,
    sql`SELECT event_id, event_type, component, domain, action_id, status, summary, occurred_at, source_kind, source_id, source_ref, payload FROM nexo_ops.runtime_events ORDER BY occurred_at DESC LIMIT 80`,
    sql`SELECT source_key, source_kind, source_id, source_ref, source_revision, fingerprint, observed_at, last_synced_at, sync_status, error_text, payload FROM nexo_ops.sync_state ORDER BY last_synced_at DESC NULLS LAST LIMIT 40`
  ]);

  return { currentState, attention, runtimeEvents, syncRows };
}

function createHandler({
  env = process.env,
  queryDatabaseFn = queryDatabase,
  now = () => new Date()
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const connection = chooseDatabaseUrl(env);
    if (!connection) {
      return res.status(200).json(fallbackPayload('DATABASE_URL_NOT_CONFIGURED'));
    }

    try {
      const rows = await queryDatabaseFn(connection.value);
      const payload = shapePayload(rows, now());
      payload.meta = { connectionEnv: connection.key, readModel: 'nexo_ops', truthOwner: false };
      return res.status(200).json(payload);
    } catch (error) {
      const message = String(error && error.message ? error.message : error).replace(/\s+/g, ' ').slice(0, 180);
      return res.status(200).json(fallbackPayload(`NEON_QUERY_FAILED:${message}`));
    }
  };
}

const handler = createHandler();
handler.createHandler = createHandler;
handler.queryDatabase = queryDatabase;
module.exports = handler;
