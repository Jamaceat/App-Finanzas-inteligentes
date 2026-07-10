import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const sections = sqliteTable(
  'sections',
  {
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
  },
  (table) => [index('sections_archived_at_idx').on(table.archivedAt)],
);

export const recurringRules = sqliteTable(
  'recurring_rules',
  {
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
    // Solo aplica a reglas kind='expense': tanque de ingreso del que va a salir este
    // gasto una vez confirmado. Se setea al "asignar" en asignar-gastos/Home (planificar,
    // sin crear transacción todavía) y se lee en Confirmar para no volver a preguntar.
    plannedTankRuleId: integer('planned_tank_rule_id').references(
      (): AnySQLiteColumn => recurringRules.id,
    ),
    // Editar una regla archiva la versión anterior y crea una fila nueva (ver
    // replaceRecurringRule): este campo encadena la nueva con la archivada para poder
    // reconstruir el linaje completo. Se usa para no volver a pedir confirmación de
    // ciclos que ya se confirmaron bajo una versión anterior de la regla (p.ej. al
    // cambiar la frecuencia con una fecha de inicio anterior a la última confirmación).
    previousRuleId: integer('previous_rule_id').references(
      (): AnySQLiteColumn => recurringRules.id,
    ),
    // 'special' marca un tanque temporal creado desde el dinero Libre para cubrir un
    // gasto puntual cuando ningún tanque real alcanza (ver computeSpecialTanks). Solo
    // aplica a filas kind='income'; specialTankExpenseId apunta al gasto dueño (1 a 1).
    tankKind: text('tank_kind', { enum: ['normal', 'special'] }).notNull().default('normal'),
    specialTankExpenseId: integer('special_tank_expense_id').references(
      (): AnySQLiteColumn => recurringRules.id,
    ),
    reminderEnabled: integer('reminder_enabled', { mode: 'boolean' }).notNull().default(true),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    // Auditoría del momento exacto (con hora) del último create/update. A diferencia
    // de nextDueDate -que es solo una fecha de ciclo, sin hora relevante-, este campo
    // sí guarda el instante real en que se tocó la fila.
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('recurring_rules_archived_at_idx').on(table.archivedAt)],
);

export const transactions = sqliteTable(
  'transactions',
  {
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
  },
  (table) => [
    index('transactions_occurred_at_idx').on(table.occurredAt),
    index('transactions_section_id_idx').on(table.sectionId),
    index('transactions_recurring_rule_id_idx').on(table.recurringRuleId),
    index('transactions_kind_allocated_income_rule_id_idx').on(
      table.kind,
      table.allocatedIncomeRuleId,
    ),
  ],
);

export const savingsGoals = sqliteTable(
  'savings_goals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    targetAmount: real('target_amount').notNull(),
    currentAmount: real('current_amount').notNull().default(0),
    archivedAt: integer('archived_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('savings_goals_archived_at_idx').on(table.archivedAt)],
);

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
  transactionsPageSize: integer('transactions_page_size').notNull().default(20),
  allowPartialTankAssignment: integer('allow_partial_tank_assignment', { mode: 'boolean' })
    .notNull()
    .default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
