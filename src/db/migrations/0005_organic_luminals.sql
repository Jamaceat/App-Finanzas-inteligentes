ALTER TABLE `app_settings` ADD `calendar_simulation_occurrences` integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_settings` DROP COLUMN `calendar_simulation_months`;