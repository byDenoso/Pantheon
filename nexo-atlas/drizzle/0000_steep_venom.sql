CREATE TABLE `atlas_login_budget` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atlas_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`credential` text NOT NULL,
	`expires_at` integer NOT NULL
);
