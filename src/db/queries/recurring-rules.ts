import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { recurringRules } from '@/db/schema';

export type RecurringFrequency = (typeof recurringRules.$inferSelect)['frequency'];
export type RecurringKind = (typeof recurringRules.$inferSelect)['kind'];

export function listActiveRecurringRules() {
  return db.select().from(recurringRules).where(isNull(recurringRules.archivedAt));
}

export function createRecurringRule(input: {
  sectionId: number;
  label: string;
  kind: RecurringKind;
  frequency: RecurringFrequency;
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

export function archiveRecurringRule(id: number) {
  return db
    .update(recurringRules)
    .set({ archivedAt: new Date() })
    .where(and(eq(recurringRules.id, id), isNull(recurringRules.archivedAt)))
    .returning();
}
