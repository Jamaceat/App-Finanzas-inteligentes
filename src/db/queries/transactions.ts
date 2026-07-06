import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';

export type TransactionKind = (typeof transactions.$inferSelect)['kind'];

export function listTransactions(filter?: { sectionId?: number; from?: Date; to?: Date }) {
  const conditions = [
    filter?.sectionId !== undefined ? eq(transactions.sectionId, filter.sectionId) : undefined,
    filter?.from ? gte(transactions.occurredAt, filter.from) : undefined,
    filter?.to ? lte(transactions.occurredAt, filter.to) : undefined,
  ].filter((condition) => condition !== undefined);

  const query = db.select().from(transactions).orderBy(desc(transactions.occurredAt));

  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

export function createTransaction(input: {
  sectionId: number;
  amount: number;
  kind: TransactionKind;
  description?: string;
  occurredAt: Date;
  recurringRuleId?: number;
}) {
  return db.insert(transactions).values(input).returning();
}

export function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id)).returning();
}
