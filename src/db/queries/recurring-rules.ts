import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { recurringRules } from '@/db/schema';
import { advanceDate } from '@/db/queries/tanks';

export type RecurringFrequency = (typeof recurringRules.$inferSelect)['frequency'];
export type RecurringKind = (typeof recurringRules.$inferSelect)['kind'];
export type CustomIntervalUnit = NonNullable<
  (typeof recurringRules.$inferSelect)['customIntervalUnit']
>;

export function listActiveRecurringRules() {
  return db.select().from(recurringRules).where(isNull(recurringRules.archivedAt));
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
}) {
  return db.insert(recurringRules).values(input).returning();
}

export function updateNextDueDate(id: number, nextDueDate: Date) {
  return db.update(recurringRules).set({ nextDueDate }).where(eq(recurringRules.id, id)).returning();
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

export async function rolloverDueIncomeRules(
  rules: (typeof recurringRules.$inferSelect)[],
): Promise<void> {
  const now = new Date();

  for (const rule of rules) {
    if (rule.kind !== 'income' || rule.archivedAt) continue;
    if (rule.nextDueDate >= now) continue;

    let next = rule.nextDueDate;
    while (next < now) {
      next = advanceDate(next, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit);
    }
    await updateNextDueDate(rule.id, next);
  }
}
