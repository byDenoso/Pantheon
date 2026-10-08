export * from './inbox-gateway-core.mjs';
import {readSpool, appendSpoolRow, fullSpoolRow, inboxDrop as legacyDrop} from './inbox-gateway-core.mjs';
import {isOperationalEnvelope, SPOOL_ID} from './mcp/operational-queue.mjs';
import {createReliableInboxDrop} from './inbox-reliable-drop.mjs';
// Preserve robot OIDC, scientific ingress and existing adapters; harden only generic delivery.
export const inboxDrop = createReliableInboxDrop({readSpool, appendSpoolRow, fullSpoolRow,
  legacyDrop, isOperationalEnvelope, spoolId: SPOOL_ID});
