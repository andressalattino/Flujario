CREATE TABLE `news_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_name` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`image_url` text,
	`category` text NOT NULL,
	`language` text NOT NULL,
	`published_at` text NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_article_url` ON `news_articles` (`url`);--> statement-breakpoint
CREATE INDEX `news_source_published` ON `news_articles` (`source`,`published_at`);--> statement-breakpoint
CREATE INDEX `news_published` ON `news_articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `news_category_published` ON `news_articles` (`category`,`published_at`);--> statement-breakpoint
CREATE TABLE `news_sync_state` (
	`source` text PRIMARY KEY NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`last_attempt_at` text,
	`last_success_at` text,
	`next_attempt_at` text NOT NULL,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `saved_news` (
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`saved_at` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_news_user_article` ON `saved_news` (`user_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `saved_news_article` ON `saved_news` (`article_id`);