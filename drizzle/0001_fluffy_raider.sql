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