CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tank_max_renewal_value` integer DEFAULT 30 NOT NULL,
	`tank_max_renewal_unit` text DEFAULT 'days' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
