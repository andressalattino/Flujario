CREATE TABLE `breakdown_revisions` (
	`import_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`currency` text NOT NULL,
	`entry_id` text,
	`history_row_id` text,
	FOREIGN KEY (`import_id`,`user_id`,`currency`) REFERENCES `statement_imports`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`,`user_id`,`currency`) REFERENCES `entries`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`history_row_id`,`user_id`,`currency`) REFERENCES `statement_rows`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "breakdown_revision_target" CHECK((entry_id IS NOT NULL AND history_row_id IS NULL) OR (entry_id IS NULL AND history_row_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TRIGGER breakdown_revision_guard BEFORE INSERT ON breakdown_revisions BEGIN
 SELECT CASE WHEN
 NOT EXISTS(SELECT 1 FROM statement_imports b WHERE b.id=NEW.import_id AND b.user_id=NEW.user_id AND b.currency=NEW.currency AND b.mode='card')
 OR NOT EXISTS(SELECT 1 FROM statement_rows r WHERE r.import_id=NEW.import_id AND r.user_id=NEW.user_id AND r.scope='part')
 OR (NEW.entry_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.id=NEW.entry_id AND e.user_id=NEW.user_id AND e.currency=NEW.currency AND e.kind='expense'))
 OR (NEW.history_row_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM statement_rows r WHERE r.id=NEW.history_row_id AND r.user_id=NEW.user_id AND r.currency=NEW.currency AND r.scope='history' AND r.kind='expense'))
 THEN RAISE(ABORT,'statement_revision_target') END;
END;
--> statement-breakpoint
CREATE TRIGGER breakdown_revision_immutable BEFORE UPDATE ON breakdown_revisions
BEGIN SELECT RAISE(ABORT,'statement_revision_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER breakdown_pointer_insert BEFORE INSERT ON expense_breakdowns
WHEN NOT EXISTS(SELECT 1 FROM breakdown_revisions v WHERE v.import_id=NEW.import_id AND v.user_id=NEW.user_id AND v.currency=NEW.currency AND v.entry_id IS NEW.entry_id AND v.history_row_id IS NEW.history_row_id)
BEGIN SELECT RAISE(ABORT,'statement_revision_target'); END;
--> statement-breakpoint
CREATE TRIGGER breakdown_pointer_update BEFORE UPDATE ON expense_breakdowns
WHEN NOT EXISTS(SELECT 1 FROM breakdown_revisions v WHERE v.import_id=NEW.import_id AND v.user_id=NEW.user_id AND v.currency=NEW.currency AND v.entry_id IS NEW.entry_id AND v.history_row_id IS NEW.history_row_id)
BEGIN SELECT RAISE(ABORT,'statement_revision_target'); END;
