-- D1 aplica esta migración en una transacción con claves foráneas activas.
-- Se conservan copias sin FK, se reconstruyen las tablas en orden de dependencia
-- y se restauran TODOS los registros. Un error revierte la migración completa.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE __flujario_rules_backup AS SELECT * FROM payment_rules;
--> statement-breakpoint
CREATE TABLE __flujario_occurrences_backup AS
SELECT o.*, CASE WHEN EXISTS (SELECT 1 FROM payment_rules r WHERE r.id = o.rule_id AND r.user_id = o.user_id AND r.anchor_date = o.due_date) THEN 'manual' ELSE 'inherited' END AS amount_source
FROM payment_occurrences o;
--> statement-breakpoint
CREATE TABLE __flujario_entries_backup AS SELECT * FROM entries;
--> statement-breakpoint
CREATE TABLE __flujario_notices_backup AS SELECT * FROM dismissed_payment_notices;
--> statement-breakpoint
DROP TABLE dismissed_payment_notices;
--> statement-breakpoint
DROP TABLE entries;
--> statement-breakpoint
DROP TABLE payment_occurrences;
--> statement-breakpoint
DROP TABLE payment_rules;
--> statement-breakpoint
CREATE TABLE `payment_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`amount_cents` integer,
	`currency` text NOT NULL,
	`anchor_date` text NOT NULL,
	`frequency` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	CONSTRAINT "rule_amount" CHECK("payment_rules"."amount_cents" IS NULL OR (typeof("payment_rules"."amount_cents") = 'integer' AND "payment_rules"."amount_cents" > 0 AND "payment_rules"."amount_cents" <= 1000000000000)),
	CONSTRAINT "rule_currency" CHECK("payment_rules"."currency" IN ('ARS','USD')),
	CONSTRAINT "rule_frequency" CHECK("payment_rules"."frequency" IN ('once','monthly','quarterly','yearly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_request` ON `payment_rules` (`user_id`,`request_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_owner` ON `payment_rules` (`id`,`user_id`,`currency`);
--> statement-breakpoint
CREATE TABLE `payment_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`user_id` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_cents` integer,
	`amount_source` text DEFAULT 'inherited' NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`rule_id`,`user_id`,`currency`) REFERENCES `payment_rules`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "occurrence_amount" CHECK("payment_occurrences"."amount_cents" IS NULL OR (typeof("payment_occurrences"."amount_cents") = 'integer' AND "payment_occurrences"."amount_cents" > 0 AND "payment_occurrences"."amount_cents" <= 1000000000000)),
	CONSTRAINT "occurrence_amount_source" CHECK("payment_occurrences"."amount_source" IN ('manual','inherited'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_rule_date` ON `payment_occurrences` (`rule_id`,`due_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_owner` ON `payment_occurrences` (`id`,`user_id`,`currency`);
--> statement-breakpoint
CREATE INDEX `occurrence_user_due` ON `payment_occurrences` (`user_id`,`due_date`);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` text NOT NULL,
	`target_account_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`date` text NOT NULL,
	`occurrence_id` text,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`,`user_id`,`currency`) REFERENCES `accounts`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_account_id`,`user_id`,`currency`) REFERENCES `accounts`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`occurrence_id`,`user_id`,`currency`) REFERENCES `payment_occurrences`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_amount" CHECK(typeof("entries"."amount_cents") = 'integer' AND "entries"."amount_cents" > 0 AND "entries"."amount_cents" <= 1000000000000),
	CONSTRAINT "entry_kind" CHECK("entries"."kind" IN ('income','expense','transfer')),
	CONSTRAINT "transfer_accounts" CHECK(("entries"."kind" = 'transfer' AND "entries"."target_account_id" IS NOT NULL AND "entries"."target_account_id" <> "entries"."account_id") OR ("entries"."kind" <> 'transfer' AND "entries"."target_account_id" IS NULL)),
	CONSTRAINT "paid_is_expense" CHECK("entries"."occurrence_id" IS NULL OR "entries"."kind" = 'expense')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_request` ON `entries` (`user_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_occurrence` ON `entries` (`occurrence_id`);--> statement-breakpoint
CREATE INDEX `entries_user_date` ON `entries` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `dismissed_payment_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`occurrence_id` text NOT NULL,
	`currency` text NOT NULL,
	`dismissed_at` text NOT NULL,
	FOREIGN KEY (`occurrence_id`,`user_id`,`currency`) REFERENCES `payment_occurrences`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_notice_user_occurrence` ON `dismissed_payment_notices` (`user_id`,`occurrence_id`);
--> statement-breakpoint
CREATE TABLE `payment_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`occurrence_id` text NOT NULL,
	`currency` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`occurrence_id`,`user_id`,`currency`) REFERENCES `payment_occurrences`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_mutation_request` ON `payment_mutations` (`user_id`,`request_key`);--> statement-breakpoint
INSERT INTO payment_rules SELECT * FROM __flujario_rules_backup;
--> statement-breakpoint
INSERT INTO payment_occurrences (id,rule_id,user_id,due_date,amount_cents,amount_source,currency)
SELECT id,rule_id,user_id,due_date,amount_cents,amount_source,currency FROM __flujario_occurrences_backup;
--> statement-breakpoint
INSERT INTO entries SELECT * FROM __flujario_entries_backup;
--> statement-breakpoint
INSERT INTO dismissed_payment_notices SELECT * FROM __flujario_notices_backup;
--> statement-breakpoint
DROP TABLE __flujario_notices_backup;
--> statement-breakpoint
DROP TABLE __flujario_entries_backup;
--> statement-breakpoint
DROP TABLE __flujario_occurrences_backup;
--> statement-breakpoint
DROP TABLE __flujario_rules_backup;
