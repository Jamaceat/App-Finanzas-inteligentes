ALTER TABLE `transactions` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `transactions_deleted_at_idx` ON `transactions` (`deleted_at`);