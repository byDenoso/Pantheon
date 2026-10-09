export * from './inbox-gateway-core.mjs';
import {readSpool, appendSpoolRow, fullSpoolRow, inboxDrop as legacyDrop} from './inbox-gateway-core.mjs';
import {isOperationalEnvelope} from './mcp/operational-queue.mjs';
import {createReliableInboxDrop} from './inbox-reliable-drop.mjs';
// Generic ingress retains its configured destination. Scientific ingress still pins its own Writer spool.
const spoolId = env => String(env.NEXO_SPOOL_ID || '1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E').trim();
export const inboxDrop = createReliableInboxDrop({readSpool, appendSpoolRow, fullSpoolRow,
  legacyDrop, isOperationalEnvelope, spoolId});
