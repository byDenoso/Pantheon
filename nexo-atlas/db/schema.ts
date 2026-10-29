import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('atlas_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  credential: text('credential').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const attempts = sqliteTable('atlas_login_budget', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const owner = sqliteTable('atlas_owner', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull(),
  pinHash: text('pin_hash').notNull(),
});
export const autonomyDecisions = sqliteTable('atlas_autonomy_decisions', {
  id: text('id').primaryKey(),
  proposalSha256: text('proposal_sha256').notNull().unique(),
  envelopeJson: text('envelope_json').notNull(),
  confirmedAt: integer('confirmed_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  nonce: text('nonce').notNull(),
  userId: text('user_id').notNull(),
  sessionHash: text('session_hash').notNull(),
  credentialHash: text('credential_hash').notNull(),
});
