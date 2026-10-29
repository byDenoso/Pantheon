CREATE TABLE `atlas_autonomy_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_sha256` text NOT NULL,
	`envelope_json` text NOT NULL,
	`confirmed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`nonce` text NOT NULL,
	`user_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`credential_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atlas_autonomy_decisions_proposal_sha256_unique` ON `atlas_autonomy_decisions` (`proposal_sha256`);