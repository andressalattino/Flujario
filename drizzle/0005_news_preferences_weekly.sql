CREATE TABLE `favorite_news_sources` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_news_user_source` ON `favorite_news_sources` (`user_id`,`source`);--> statement-breakpoint
CREATE TABLE `weekly_news_articles` (
	`period` text NOT NULL,
	`article_id` text NOT NULL,
	FOREIGN KEY (`period`) REFERENCES `weekly_news_editions`(`period`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_news_period_article` ON `weekly_news_articles` (`period`,`article_id`);--> statement-breakpoint
CREATE INDEX `weekly_news_article` ON `weekly_news_articles` (`article_id`);--> statement-breakpoint
CREATE TABLE `weekly_news_editions` (
	`period` text PRIMARY KEY NOT NULL,
	`publication_token` text NOT NULL,
	`published_at` text NOT NULL,
	`from_at` text NOT NULL,
	`to_at` text NOT NULL
);
