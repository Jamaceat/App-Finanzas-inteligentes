import { and, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import {
  updateNextDueDate,
  type CustomIntervalUnit,
  type RecurringFrequency,
} from '@/db/queries/recurring-rules';
import { advanceDate } from '@/db/queries/tanks';

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
  allocatedIncomeRuleId?: number;
}) {
  return db.insert(transactions).values(input).returning();
}

export function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id)).returning();
}

export function listUnassignedExpenseTransactions() {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.kind, 'expense'), isNull(transactions.allocatedIncomeRuleId)))
    .orderBy(desc(transactions.occurredAt));
}

export function assignTransactionToIncomeTank(transactionId: number, incomeRuleId: number) {
  return db
    .update(transactions)
    .set({ allocatedIncomeRuleId: incomeRuleId })
    .where(eq(transactions.id, transactionId))
    .returning();
}

export function unassignTransactionFromIncomeTank(transactionId: number) {
  return db
    .update(transactions)
    .set({ allocatedIncomeRuleId: null })
    .where(eq(transactions.id, transactionId))
    .returning();
}

export function listAssignedExpenseTransactions() {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.kind, 'expense'), isNotNull(transactions.allocatedIncomeRuleId)))
    .orderBy(desc(transactions.occurredAt));
}

export async function allocateExpenseToIncomeTank(input: {
  expenseRuleId: number;
  incomeRuleId: number;
  sectionId: number;
  amount: number;
  frequency: RecurringFrequency;
  customIntervalValue?: number | null;
  customIntervalUnit?: CustomIntervalUnit | null;
  nextDueDate: Date;
  description?: string;
}) {
  const [transaction] = await createTransaction({
    sectionId: input.sectionId,
    amount: input.amount,
    kind: 'expense',
    description: input.description,
    occurredAt: new Date(),
    recurringRuleId: input.expenseRuleId,
    allocatedIncomeRuleId: input.incomeRuleId,
  });

  await updateNextDueDate(
    input.expenseRuleId,
    advanceDate(input.nextDueDate, input.frequency, input.customIntervalValue, input.customIntervalUnit),
  );

  return transaction;
}
