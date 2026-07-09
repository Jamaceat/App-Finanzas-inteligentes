CREATE INDEX `recurring_rules_archived_at_idx` ON `recurring_rules` (`archived_at`);--> statement-breakpoint
CREATE INDEX `savings_goals_archived_at_idx` ON `savings_goals` (`archived_at`);--> statement-breakpoint
CREATE INDEX `sections_archived_at_idx` ON `sections` (`archived_at`);--> statement-breakpoint
CREATE INDEX `transactions_occurred_at_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_section_id_idx` ON `transactions` (`section_id`);--> statement-breakpoint
CREATE INDEX `transactions_recurring_rule_id_idx` ON `transactions` (`recurring_rule_id`);--> statement-breakpoint
CREATE INDEX `transactions_kind_allocated_income_rule_id_idx` ON `transactions` (`kind`,`allocated_income_rule_id`);