CREATE TABLE `expense_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`currency` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`previous_amount_cents` integer NOT NULL,
	`previous_description` text NOT NULL,
	`previous_category` text NOT NULL,
	`previous_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`,`user_id`,`currency`) REFERENCES `entries`(`id`,`user_id`,`currency`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_edit_amounts" CHECK(typeof("expense_edits"."amount_cents") = 'integer' AND "expense_edits"."amount_cents" BETWEEN 1 AND 1000000000000 AND typeof("expense_edits"."previous_amount_cents") = 'integer' AND "expense_edits"."previous_amount_cents" BETWEEN 1 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_edits_request` ON `expense_edits` (`user_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `expense_edits_entry` ON `expense_edits` (`entry_id`,`user_id`,`currency`);
--> statement-breakpoint
CREATE TRIGGER expense_edits_immutable BEFORE UPDATE ON expense_edits
BEGIN SELECT RAISE(ABORT,'expense_edits_immutable'); END;
