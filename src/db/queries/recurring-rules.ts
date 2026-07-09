import { and, count, eq, isNull, like } from 'drizzle-orm';

import { db } from '@/db/client';
import { recurringRules } from '@/db/schema';

export type RecurringFrequency = (typeof recurringRules.$inferSelect)['frequency'];
export type RecurringKind = (typeof recurringRules.$inferSelect)['kind'];
export type CustomIntervalUnit = NonNullable<
  (typeof recurringRules.$inferSelect)['customIntervalUnit']
>;

export type RecurringRuleFilter = { kind?: RecurringKind; search?: string };

function recurringRuleFilterConditions(filter?: RecurringRuleFilter) {
  const search = filter?.search?.trim();
  return [
    isNull(recurringRules.archivedAt),
    filter?.kind !== undefined ? eq(recurringRules.kind, filter.kind) : undefined,
    search ? like(recurringRules.label, `%${search}%`) : undefined,
  ].filter((condition) => condition !== undefined);
}

export function listAllRecurringRules() {
  return db.select().from(recurringRules);
}

export function listActiveRecurringRules(
  filter?: RecurringRuleFilter & { limit?: number; offset?: number },
) {
  const query = db
    .select()
    .from(recurringRules)
    .where(and(...recurringRuleFilterConditions(filter)));

  if (filter?.limit !== undefined) {
    return query.limit(filter.limit).offset(filter.offset ?? 0);
  }

  return query;
}

export function countActiveRecurringRules(filter?: RecurringRuleFilter) {
  return db
    .select({ count: count() })
    .from(recurringRules)
    .where(and(...recurringRuleFilterConditions(filter)));
}

export function createRecurringRule(input: {
  sectionId: number;
  label: string;
  kind: RecurringKind;
  frequency: RecurringFrequency;
  customIntervalValue?: number | null;
  customIntervalUnit?: CustomIntervalUnit | null;
  isVariableAmount: boolean;
  estimatedAmount?: number;
  nextDueDate: Date;
  reminderEnabled?: boolean;
  plannedTankRuleId?: number | null;
}) {
  return db.insert(recurringRules).values(input).returning();
}

export function updateNextDueDate(id: number, nextDueDate: Date) {
  return db.update(recurringRules).set({ nextDueDate }).where(eq(recurringRules.id, id)).returning();
}

export function updatePlannedTankRuleId(id: number, plannedTankRuleId: number | null) {
  return db
    .update(recurringRules)
    .set({ plannedTankRuleId })
    .where(eq(recurringRules.id, id))
    .returning();
}

export function updateRecurringRule(
  id: number,
  input: Partial<{
    sectionId: number;
    label: string;
    kind: RecurringKind;
    frequency: RecurringFrequency;
    customIntervalValue: number | null;
    customIntervalUnit: CustomIntervalUnit | null;
    isVariableAmount: boolean;
    estimatedAmount: number | null;
    nextDueDate: Date;
    reminderEnabled: boolean;
  }>,
) {
  return db.update(recurringRules).set(input).where(eq(recurringRules.id, id)).returning();
}

export function archiveRecurringRule(id: number) {
  return db
    .update(recurringRules)
    .set({ archivedAt: new Date() })
    .where(and(eq(recurringRules.id, id), isNull(recurringRules.archivedAt)))
    .returning();
}
