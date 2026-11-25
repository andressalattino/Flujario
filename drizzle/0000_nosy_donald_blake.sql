CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`opening_cents` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "account_currency" CHECK("accounts"."currency" IN ('ARS','USD')),
	CONSTRAINT "opening_integer" CHECK(typeof("accounts"."opening_cents") = 'integer' AND abs("accounts"."opening_cents") <= 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_currency` ON `accounts` (`user_id`,`currency`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_currency` ON `accounts` (`id`,`user_id`,`currency`);--> statement-breakpoint
CREATE TABLE `news_editions` (
	`id` text PRIMARY KEY NOT NULL,
	`cadence` text NOT NULL,
	`period` text NOT NULL,
	`refreshed_at` text NOT NULL,
	`articles_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edition_cadence_period` ON `news_editions` (`cadence`,`period`);--> statement-breakpoint
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
CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_user_symbol` ON `favorites` (`user_id`,`symbol`);--> statement-breakpoint
CREATE TABLE `payment_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`user_id` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`rule_id`,`user_id`,`currency`) REFERENCES `payment_rules`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "occurrence_amount" CHECK(typeof("payment_occurrences"."amount_cents") = 'integer' AND "payment_occurrences"."amount_cents" > 0 AND "payment_occurrences"."amount_cents" <= 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_rule_date` ON `payment_occurrences` (`rule_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_owner` ON `payment_occurrences` (`id`,`user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `occurrence_user_due` ON `payment_occurrences` (`user_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `payment_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`anchor_date` text NOT NULL,
	`frequency` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	CONSTRAINT "rule_amount" CHECK(typeof("payment_rules"."amount_cents") = 'integer' AND "payment_rules"."amount_cents" > 0 AND "payment_rules"."amount_cents" <= 1000000000000),
	CONSTRAINT "rule_currency" CHECK("payment_rules"."currency" IN ('ARS','USD')),
	CONSTRAINT "rule_frequency" CHECK("payment_rules"."frequency" IN ('once','monthly','quarterly','yearly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_request` ON `payment_rules` (`user_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_owner` ON `payment_rules` (`id`,`user_id`,`currency`);