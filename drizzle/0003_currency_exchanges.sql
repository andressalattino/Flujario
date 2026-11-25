-- Ampliación a diez monedas y cambios con dos importes, con FK activas.
-- Las columnas históricas *_cents conservan su nombre SQL; ahora expresan
-- unidades mínimas de la moneda. Los enteros anteriores de ARS/USD no cambian.
-- Política aprobada el 17/11/2026: quitar sólo montos heredados de meses
-- posteriores a noviembre. Se conservan ajustes propios y gastos confirmados.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE __flujario3_accounts AS SELECT * FROM accounts;
--> statement-breakpoint
CREATE TABLE __flujario3_payment_rules AS SELECT * FROM payment_rules;
--> statement-breakpoint
CREATE TABLE __flujario3_payment_occurrences AS SELECT * FROM payment_occurrences;
--> statement-breakpoint
CREATE TABLE __flujario3_entries AS SELECT * FROM entries;
--> statement-breakpoint
CREATE TABLE __flujario3_dismissed_payment_notices AS SELECT * FROM dismissed_payment_notices;
--> statement-breakpoint
CREATE TABLE __flujario3_payment_mutations AS SELECT * FROM payment_mutations;
--> statement-breakpoint
DROP TABLE dismissed_payment_notices;
--> statement-breakpoint
DROP TABLE payment_mutations;
--> statement-breakpoint
DROP TABLE entries;
--> statement-breakpoint
DROP TABLE payment_occurrences;
--> statement-breakpoint
DROP TABLE payment_rules;
--> statement-breakpoint
DROP TABLE accounts;
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`opening_cents` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "account_currency" CHECK("accounts"."currency" IN ('ARS','USD','EUR','BRL','CLP','UYU','GBP','CAD','AUD','CHF')),
	CONSTRAINT "opening_integer" CHECK(typeof("accounts"."opening_cents") = 'integer' AND abs("accounts"."opening_cents") <= 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_currency` ON `accounts` (`user_id`,`currency`);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_currency` ON `accounts` (`id`,`user_id`,`currency`);
--> statement-breakpoint
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
	`target_currency` text,
	`target_amount_minor` integer,
	`exchange_rate` text,
	`exchange_quote_id` text,
	FOREIGN KEY (`exchange_quote_id`) REFERENCES `exchange_quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`user_id`,`currency`) REFERENCES `accounts`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_account_id`,`user_id`,`target_currency`) REFERENCES `accounts`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`occurrence_id`,`user_id`,`currency`) REFERENCES `payment_occurrences`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_amount" CHECK(typeof("entries"."amount_cents") = 'integer' AND "entries"."amount_cents" > 0 AND "entries"."amount_cents" <= 1000000000000),
	CONSTRAINT "entry_kind" CHECK("entries"."kind" IN ('income','expense','transfer','exchange')),
	CONSTRAINT "transfer_accounts" CHECK(("entries"."kind" IN ('income','expense') AND "entries"."target_account_id" IS NULL AND "entries"."target_currency" IS NULL AND "entries"."target_amount_minor" IS NULL AND "entries"."exchange_rate" IS NULL AND "entries"."exchange_quote_id" IS NULL)
        OR ("entries"."kind" = 'transfer' AND "entries"."target_account_id" IS NOT NULL AND "entries"."target_account_id" <> "entries"."account_id" AND "entries"."target_currency" = "entries"."currency" AND "entries"."target_currency" IS NOT NULL AND "entries"."target_amount_minor" = "entries"."amount_cents" AND "entries"."target_amount_minor" IS NOT NULL AND "entries"."exchange_rate" IS NULL AND "entries"."exchange_quote_id" IS NULL)
        OR ("entries"."kind" = 'exchange' AND "entries"."target_account_id" IS NOT NULL AND "entries"."target_account_id" <> "entries"."account_id" AND "entries"."target_currency" IS NOT NULL AND "entries"."target_currency" <> "entries"."currency" AND typeof("entries"."target_amount_minor") = 'integer' AND "entries"."target_amount_minor" > 0 AND "entries"."target_amount_minor" <= 1000000000000 AND "entries"."exchange_rate" IS NOT NULL)),
	CONSTRAINT "exchange_rate_text" CHECK("entries"."exchange_rate" IS NULL OR (typeof("entries"."exchange_rate") = 'text' AND length("entries"."exchange_rate") BETWEEN 1 AND 21 AND "entries"."exchange_rate" GLOB '[0-9]*' AND "entries"."exchange_rate" NOT GLOB '*[^0-9.]*' AND length("entries"."exchange_rate") - length(replace("entries"."exchange_rate",'.','')) <= 1 AND "entries"."exchange_rate" NOT LIKE '%.' AND length(replace(replace("entries"."exchange_rate",'0',''),'.','')) > 0)),
	CONSTRAINT "paid_is_expense" CHECK("entries"."occurrence_id" IS NULL OR "entries"."kind" = 'expense')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_request` ON `entries` (`user_id`,`request_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_occurrence` ON `entries` (`occurrence_id`);
--> statement-breakpoint
CREATE INDEX `entries_user_date` ON `entries` (`user_id`,`date`);
--> statement-breakpoint
CREATE TABLE `exchange_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`series` text NOT NULL,
	`currency` text NOT NULL,
	`buy_rate` text NOT NULL,
	`sell_rate` text NOT NULL,
	`source_as_of` text NOT NULL,
	`fetched_at` text NOT NULL,
	CONSTRAINT "quote_rates" CHECK((typeof("exchange_quotes"."buy_rate") = 'text' AND length("exchange_quotes"."buy_rate") BETWEEN 1 AND 21 AND "exchange_quotes"."buy_rate" GLOB '[0-9]*' AND "exchange_quotes"."buy_rate" NOT GLOB '*[^0-9.]*' AND length("exchange_quotes"."buy_rate") - length(replace("exchange_quotes"."buy_rate",'.','')) <= 1 AND "exchange_quotes"."buy_rate" NOT LIKE '%.' AND length(replace(replace("exchange_quotes"."buy_rate",'0',''),'.','')) > 0) AND (typeof("exchange_quotes"."sell_rate") = 'text' AND length("exchange_quotes"."sell_rate") BETWEEN 1 AND 21 AND "exchange_quotes"."sell_rate" GLOB '[0-9]*' AND "exchange_quotes"."sell_rate" NOT GLOB '*[^0-9.]*' AND length("exchange_quotes"."sell_rate") - length(replace("exchange_quotes"."sell_rate",'.','')) <= 1 AND "exchange_quotes"."sell_rate" NOT LIKE '%.' AND length(replace(replace("exchange_quotes"."sell_rate",'0',''),'.','')) > 0)),
	CONSTRAINT "quote_series_currency" CHECK((series = 'usd-oficial' AND currency = 'USD') OR (series = 'usd-mep' AND currency = 'USD') OR (series = 'usd-blue' AND currency = 'USD') OR (series = 'eur' AND currency = 'EUR') OR (series = 'brl' AND currency = 'BRL') OR (series = 'clp' AND currency = 'CLP') OR (series = 'uyu' AND currency = 'UYU'))
);
--> statement-breakpoint
CREATE INDEX `quote_series_date` ON `exchange_quotes` (`series`,`source_as_of`,`fetched_at`);
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
CREATE UNIQUE INDEX `payment_mutation_request` ON `payment_mutations` (`user_id`,`request_key`);
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
	CONSTRAINT "rule_currency" CHECK("payment_rules"."currency" IN ('ARS','USD','EUR','BRL','CLP','UYU','GBP','CAD','AUD','CHF')),
	CONSTRAINT "rule_frequency" CHECK("payment_rules"."frequency" IN ('once','monthly','quarterly','yearly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_request` ON `payment_rules` (`user_id`,`request_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_owner` ON `payment_rules` (`id`,`user_id`,`currency`);
--> statement-breakpoint
CREATE TABLE `quote_cache_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text NOT NULL,
	`next_attempt_at` text NOT NULL,
	`status` text NOT NULL,
	CONSTRAINT "quote_cache_status" CHECK("quote_cache_state"."status" IN ('refreshing','ok','partial','error'))
);
--> statement-breakpoint
INSERT INTO accounts SELECT * FROM __flujario3_accounts;
--> statement-breakpoint
INSERT INTO payment_rules (id,user_id,title,amount_cents,currency,anchor_date,frequency,request_key,payload_hash)
SELECT id,user_id,title,CASE WHEN frequency = 'once' THEN amount_cents ELSE NULL END,currency,anchor_date,frequency,request_key,payload_hash FROM __flujario3_payment_rules;
--> statement-breakpoint
INSERT INTO payment_occurrences (id,rule_id,user_id,due_date,amount_cents,amount_source,currency)
SELECT o.id,o.rule_id,o.user_id,o.due_date,
  CASE WHEN o.amount_source = 'inherited' AND o.due_date >= '2026-12-01'
    AND EXISTS (SELECT 1 FROM __flujario3_payment_rules r WHERE r.id = o.rule_id AND r.frequency <> 'once')
    AND NOT EXISTS (SELECT 1 FROM __flujario3_entries e WHERE e.occurrence_id = o.id)
  THEN NULL ELSE o.amount_cents END,
  o.amount_source,o.currency FROM __flujario3_payment_occurrences o;
--> statement-breakpoint
INSERT INTO entries (id,user_id,kind,account_id,target_account_id,amount_cents,currency,description,category,date,occurrence_id,request_key,payload_hash,created_at,target_currency,target_amount_minor,exchange_rate,exchange_quote_id)
SELECT id,user_id,kind,account_id,target_account_id,amount_cents,currency,description,category,date,occurrence_id,request_key,payload_hash,created_at,
  CASE WHEN kind = 'transfer' THEN currency ELSE NULL END,
  CASE WHEN kind = 'transfer' THEN amount_cents ELSE NULL END,NULL,NULL FROM __flujario3_entries;
--> statement-breakpoint
INSERT INTO dismissed_payment_notices SELECT * FROM __flujario3_dismissed_payment_notices;
--> statement-breakpoint
INSERT INTO payment_mutations SELECT * FROM __flujario3_payment_mutations;
--> statement-breakpoint
DROP TABLE __flujario3_payment_mutations;
--> statement-breakpoint
DROP TABLE __flujario3_dismissed_payment_notices;
--> statement-breakpoint
DROP TABLE __flujario3_entries;
--> statement-breakpoint
DROP TABLE __flujario3_payment_occurrences;
--> statement-breakpoint
DROP TABLE __flujario3_payment_rules;
--> statement-breakpoint
DROP TABLE __flujario3_accounts;
