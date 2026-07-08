import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sections = sqliteTable('sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  kind: text('kind', { enum: ['income', 'expense', 'both'] })
    .notNull()
    .default('both'),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const recurringRules = sqliteTable('recurring_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id')
    .notNull()
    .references(() => sections.id),
  label: text('label').notNull(),
  kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
  frequency: text('frequency', {
    enum: [
      'daily',
      'weekly',
      'biweekly',
      'monthly',
      'quarterly',
      'semiannual',
      'yearly',
      'custom',
    ],
  }).notNull(),
  customIntervalValue: integer('custom_interval_value'),
  customIntervalUnit: text('custom_interval_unit', { enum: ['days', 'weeks'] }),
  isVariableAmount: integer('is_variable_amount', { mode: 'boolean' }).notNull().default(false),
  estimatedAmount: real('estimated_amount'),
  nextDueDate: integer('next_due_date', { mode: 'timestamp' }).notNull(),
  reminderEnabled: integer('reminder_enabled', { mode: 'boolean' }).notNull().default(true),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id')
    .notNull()
    .references(() => sections.id),
  recurringRuleId: integer('recurring_rule_id').references(() => recurringRules.id),
  allocatedIncomeRuleId: integer('allocated_income_rule_id').references(() => recurringRules.id),
  amount: real('amount').notNull(),
  kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
  description: text('description'),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const savingsGoals = sqliteTable('savings_goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  targetAmount: real('target_amount').notNull(),
  currentAmount: real('current_amount').notNull().default(0),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tankMaxRenewalValue: integer('tank_max_renewal_value').notNull().default(30),
  tankMaxRenewalUnit: text('tank_max_renewal_unit', {
    enum: ['days', 'weeks', 'months', 'years'],
  })
    .notNull()
    .default('days'),
  vibrationEnabled: integer('vibration_enabled', { mode: 'boolean' }).notNull().default(true),
  calendarSimulationOccurrences: integer('calendar_simulation_occurrences').notNull().default(24),
  restrictPastStartDates: integer('restrict_past_start_dates', { mode: 'boolean' })
    .notNull()
    .default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
