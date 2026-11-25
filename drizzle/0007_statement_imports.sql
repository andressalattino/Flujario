CREATE TABLE `expense_breakdowns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`currency` text NOT NULL,
	`entry_id` text,
	`history_row_id` text,
	`import_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`import_id`,`user_id`,`currency`) REFERENCES `statement_imports`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`,`user_id`,`currency`) REFERENCES `entries`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`history_row_id`,`user_id`,`currency`) REFERENCES `statement_rows`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "breakdown_target" CHECK((entry_id IS NOT NULL AND history_row_id IS NULL) OR (entry_id IS NULL AND history_row_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `breakdown_entry` ON `expense_breakdowns` (`entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `breakdown_history` ON `expense_breakdowns` (`history_row_id`);--> statement-breakpoint
CREATE INDEX `breakdown_owner_currency` ON `expense_breakdowns` (`user_id`,`currency`);--> statement-breakpoint
CREATE TABLE `statement_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`institution` text NOT NULL,
	`format` text NOT NULL,
	`currency` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "statement_import_currency" CHECK(currency IN ('ARS','USD','EUR','BRL','CLP','UYU','GBP','CAD','AUD','CHF')),
	CONSTRAINT "statement_import_mode" CHECK(mode IN ('bank','card')),
	CONSTRAINT "statement_import_format" CHECK(format IN ('csv','xlsx','xls','pdf-text','pdf-ocr')),
	CONSTRAINT "statement_import_institution" CHECK(institution IN ('nacion','credicoop','santander','bbva','galicia','macro','patagonia','mercadopago'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_request` ON `statement_imports` (`user_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `statement_import_owner_currency` ON `statement_imports` (`id`,`user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `statement_import_owner_date` ON `statement_imports` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `statement_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_key` text NOT NULL,
	`source_ref` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`scope` text NOT NULL,
	`entry_id` text,
	`duplicate_acknowledged` integer NOT NULL,
	FOREIGN KEY (`import_id`,`user_id`,`currency`) REFERENCES `statement_imports`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`,`user_id`,`currency`) REFERENCES `entries`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "statement_row_money" CHECK(typeof(amount_minor)='integer' AND abs(amount_minor) BETWEEN 1 AND 1000000000000 AND (kind='part' OR amount_minor>0)),
	CONSTRAINT "statement_row_date" CHECK(length(date)=10 AND date(date,'+0 days') IS NOT NULL AND date(date,'+0 days')=date),
	CONSTRAINT "statement_row_currency" CHECK(currency IN ('ARS','USD','EUR','BRL','CLP','UYU','GBP','CAD','AUD','CHF')),
	CONSTRAINT "statement_row_description" CHECK(length(description) BETWEEN 2 AND 120),
	CONSTRAINT "statement_row_scope" CHECK((scope='ledger' AND kind IN ('income','expense') AND entry_id IS NOT NULL) OR (scope='history' AND kind IN ('income','expense') AND entry_id IS NULL) OR (scope='internal' AND kind='internal' AND entry_id IS NULL) OR (scope='part' AND kind='part' AND entry_id IS NULL)),
	CONSTRAINT "statement_row_ack" CHECK(duplicate_acknowledged IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_row_source` ON `statement_rows` (`import_id`,`source_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `statement_row_entry` ON `statement_rows` (`entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `statement_row_owner_currency` ON `statement_rows` (`id`,`user_id`,`currency`);--> statement-breakpoint
CREATE INDEX `statement_history_date` ON `statement_rows` (`user_id`,`currency`,`date`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `opening_date` text;--> statement-breakpoint
CREATE UNIQUE INDEX `entries_owner_currency` ON `entries` (`id`,`user_id`,`currency`);
--> statement-breakpoint
-- La fecha no reinterpreta movimientos que ya fueron registrados.
CREATE TRIGGER accounts_opening_date_guard BEFORE UPDATE OF opening_date ON accounts
WHEN NEW.opening_date IS NOT OLD.opening_date AND (
 NEW.opening_date IS NULL OR length(NEW.opening_date)<>10
 OR date(NEW.opening_date,'+0 days') IS NULL OR date(NEW.opening_date,'+0 days')<>NEW.opening_date
 OR EXISTS(SELECT 1 FROM statement_rows r WHERE r.user_id=OLD.user_id AND r.currency=OLD.currency AND r.scope<>'part')
 OR EXISTS(SELECT 1 FROM entries e WHERE e.user_id=OLD.user_id AND e.date<NEW.opening_date AND (e.account_id=OLD.id OR e.target_account_id=OLD.id))
)
BEGIN SELECT RAISE(ABORT,'statement_opening_date_locked'); END;
--> statement-breakpoint
CREATE TRIGGER entries_opening_date_guard BEFORE INSERT ON entries
WHEN EXISTS(SELECT 1 FROM accounts a WHERE a.user_id=NEW.user_id AND a.opening_date IS NOT NULL AND NEW.date<a.opening_date AND (a.id=NEW.account_id OR a.id=NEW.target_account_id))
BEGIN SELECT RAISE(ABORT,'statement_before_opening'); END;
--> statement-breakpoint
CREATE TRIGGER statement_row_guard BEFORE INSERT ON statement_rows BEGIN
 SELECT CASE WHEN
  NOT EXISTS(SELECT 1 FROM statement_imports b WHERE b.id=NEW.import_id AND b.user_id=NEW.user_id AND b.currency=NEW.currency AND ((b.mode='card' AND NEW.scope='part') OR (b.mode='bank' AND NEW.scope<>'part')))
 THEN RAISE(ABORT,'statement_invalid_mode') END;
 SELECT CASE WHEN NEW.scope<>'part' AND NOT EXISTS(
  SELECT 1 FROM accounts a WHERE a.user_id=NEW.user_id AND a.currency=NEW.currency AND a.opening_date IS NOT NULL
  AND (NEW.scope='internal' OR (NEW.scope='history' AND NEW.date<a.opening_date) OR (NEW.scope='ledger' AND NEW.date>=a.opening_date))
 ) THEN RAISE(ABORT,'statement_cutoff_changed') END;
 SELECT CASE WHEN NEW.scope='ledger' AND NOT EXISTS(
  SELECT 1 FROM entries e WHERE e.id=NEW.entry_id AND e.user_id=NEW.user_id AND e.currency=NEW.currency
  AND e.kind=NEW.kind AND e.amount_cents=NEW.amount_minor AND e.date=NEW.date AND e.description=NEW.description AND e.category=NEW.category
 ) THEN RAISE(ABORT,'statement_entry_mismatch') END;
 SELECT CASE WHEN NEW.scope IN ('ledger','history') AND NEW.duplicate_acknowledged=0 AND (
  EXISTS(SELECT 1 FROM entries e WHERE e.user_id=NEW.user_id AND e.currency=NEW.currency AND e.kind=NEW.kind AND e.date=NEW.date AND e.amount_cents=NEW.amount_minor AND e.id IS NOT NEW.entry_id)
  OR EXISTS(SELECT 1 FROM statement_rows r WHERE r.user_id=NEW.user_id AND r.scope='history' AND r.currency=NEW.currency AND r.kind=NEW.kind AND r.date=NEW.date AND r.amount_minor=NEW.amount_minor)
 ) THEN RAISE(ABORT,'statement_duplicate_review') END;
END;
--> statement-breakpoint
CREATE TRIGGER statement_rows_immutable BEFORE UPDATE ON statement_rows
BEGIN SELECT RAISE(ABORT,'statement_rows_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER statement_imports_immutable BEFORE UPDATE ON statement_imports
BEGIN SELECT RAISE(ABORT,'statement_imports_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER breakdown_insert_guard BEFORE INSERT ON expense_breakdowns BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM statement_imports b WHERE b.id=NEW.import_id AND b.user_id=NEW.user_id AND b.currency=NEW.currency AND b.mode='card')
  OR NOT EXISTS(SELECT 1 FROM statement_rows r WHERE r.import_id=NEW.import_id AND r.user_id=NEW.user_id AND r.scope='part')
  OR (NEW.entry_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.id=NEW.entry_id AND e.user_id=NEW.user_id AND e.currency=NEW.currency AND e.kind='expense'))
  OR (NEW.history_row_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM statement_rows r WHERE r.id=NEW.history_row_id AND r.user_id=NEW.user_id AND r.currency=NEW.currency AND r.kind='expense' AND r.scope='history'))
 THEN RAISE(ABORT,'statement_breakdown_target') END;
END;
--> statement-breakpoint
CREATE TRIGGER breakdown_update_guard BEFORE UPDATE ON expense_breakdowns BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.currency<>OLD.currency OR NEW.entry_id IS NOT OLD.entry_id OR NEW.history_row_id IS NOT OLD.history_row_id
  OR NOT EXISTS(SELECT 1 FROM statement_imports b WHERE b.id=NEW.import_id AND b.user_id=NEW.user_id AND b.currency=NEW.currency AND b.mode='card')
  OR NOT EXISTS(SELECT 1 FROM statement_rows r WHERE r.import_id=NEW.import_id AND r.user_id=NEW.user_id AND r.scope='part')
 THEN RAISE(ABORT,'statement_breakdown_target') END;
END;
