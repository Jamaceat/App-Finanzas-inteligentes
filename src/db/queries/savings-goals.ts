import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { savingsGoals } from '@/db/schema';

export function listActiveSavingsGoals() {
  return db.select().from(savingsGoals).where(isNull(savingsGoals.archivedAt));
}

export function createSavingsGoal(input: { name: string; targetAmount: number }) {
  return db.insert(savingsGoals).values(input).returning();
}

export function contributeToSavingsGoal(id: number, amount: number) {
  return db
    .update(savingsGoals)
    .set({ currentAmount: sql`${savingsGoals.currentAmount} + ${amount}` })
    .where(and(eq(savingsGoals.id, id), isNull(savingsGoals.archivedAt)))
    .returning();
}

export function archiveSavingsGoal(id: number) {
  return db
    .update(savingsGoals)
    .set({ archivedAt: new Date() })
    .where(and(eq(savingsGoals.id, id), isNull(savingsGoals.archivedAt)))
    .returning();
}
