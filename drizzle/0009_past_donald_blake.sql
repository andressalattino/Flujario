CREATE TABLE `ai_daily_usage` (
	`user_id` text NOT NULL,
	`day_ar` text NOT NULL,
	`questions` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day_ar`),
	CONSTRAINT "ai_questions_integer" CHECK(typeof("ai_daily_usage"."questions")='integer' AND "ai_daily_usage"."questions">=0)
);
--> statement-breakpoint
CREATE TABLE `ai_global_usage` (
	`day_utc` text PRIMARY KEY NOT NULL,
	`reserved_micros` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_global_integer" CHECK(typeof("ai_global_usage"."reserved_micros")='integer' AND "ai_global_usage"."reserved_micros">=0)
);
--> statement-breakpoint
CREATE TABLE `ai_rate_windows` (
	`user_id` text NOT NULL,
	`window` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `window`),
	CONSTRAINT "ai_rate_integer" CHECK(typeof("ai_rate_windows"."count")='integer' AND "ai_rate_windows"."count" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE `ai_requests` (
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`day_ar` text NOT NULL,
	`day_utc` text NOT NULL,
	`spill_day` text,
	`question_limit` integer NOT NULL,
	`budget_micros` integer NOT NULL,
	`reserved_micros` integer NOT NULL,
	`model` text NOT NULL,
	`max_output_tokens` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`plan_json` text,
	`error_code` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`observed_micros` integer,
	`usage_source` text,
	PRIMARY KEY(`user_id`, `request_key`),
	CONSTRAINT "ai_request_status" CHECK("ai_requests"."status" IN ('reserved','complete','failed')),
	CONSTRAINT "ai_reservation_integer" CHECK(typeof("ai_requests"."reserved_micros")='integer' AND "ai_requests"."reserved_micros">0 AND typeof("ai_requests"."budget_micros")='integer' AND "ai_requests"."budget_micros">=0 AND typeof("ai_requests"."question_limit")='integer' AND "ai_requests"."question_limit">=0)
);
--> statement-breakpoint
CREATE INDEX `ai_owner_created` ON `ai_requests` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER ai_reserve_before_insert BEFORE INSERT ON ai_requests
WHEN NOT EXISTS(SELECT 1 FROM ai_requests WHERE user_id=NEW.user_id AND request_key=NEW.request_key)
BEGIN
  SELECT CASE WHEN coalesce((SELECT questions FROM ai_daily_usage WHERE user_id=NEW.user_id AND day_ar=NEW.day_ar),0)>=NEW.question_limit THEN RAISE(ABORT,'ai_user_limit') END;
  SELECT CASE WHEN coalesce((SELECT reserved_micros FROM ai_global_usage WHERE day_utc=NEW.day_utc),0)+NEW.reserved_micros>NEW.budget_micros THEN RAISE(ABORT,'ai_global_limit') END;
  SELECT CASE WHEN NEW.spill_day IS NOT NULL AND coalesce((SELECT reserved_micros FROM ai_global_usage WHERE day_utc=NEW.spill_day),0)+NEW.reserved_micros>NEW.budget_micros THEN RAISE(ABORT,'ai_global_limit') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ai_requests WHERE user_id=NEW.user_id AND status='reserved' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-60 seconds')) THEN RAISE(ABORT,'ai_in_flight') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ai_requests WHERE user_id=NEW.user_id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-5 seconds')) THEN RAISE(ABORT,'ai_cooldown') END;
END;
--> statement-breakpoint
CREATE TRIGGER ai_reserve_after_insert AFTER INSERT ON ai_requests
BEGIN
  INSERT INTO ai_daily_usage(user_id,day_ar,questions) VALUES(NEW.user_id,NEW.day_ar,1)
    ON CONFLICT(user_id,day_ar) DO UPDATE SET questions=questions+1;
  INSERT INTO ai_global_usage(day_utc,reserved_micros) VALUES(NEW.day_utc,NEW.reserved_micros)
    ON CONFLICT(day_utc) DO UPDATE SET reserved_micros=reserved_micros+NEW.reserved_micros;
  INSERT INTO ai_global_usage(day_utc,reserved_micros) SELECT NEW.spill_day,NEW.reserved_micros WHERE NEW.spill_day IS NOT NULL
    ON CONFLICT(day_utc) DO UPDATE SET reserved_micros=reserved_micros+NEW.reserved_micros;
END;
