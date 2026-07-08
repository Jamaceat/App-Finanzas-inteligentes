import { and, count, desc, eq, gte, isNotNull, isNull, like, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import {
  archiveRecurringRule,
  createRecurringRule,
  updateNextDueDate,
  type CustomIntervalUnit,
  type RecurringFrequency,
} from '@/db/queries/recurring-rules';
import { advanceDate } from '@/db/queries/tanks';

export type TransactionKind = (typeof transactions.$inferSelect)['kind'];

export type TransactionFilter = { sectionId?: number; from?: Date; to?: Date; search?: string };

function transactionFilterConditions(filter?: TransactionFilter) {
  const search = filter?.search?.trim();
  return [
    filter?.sectionId !== undefined ? eq(transactions.sectionId, filter.sectionId) : undefined,
    filter?.from ? gte(transactions.occurredAt, filter.from) : undefined,
    filter?.to ? lte(transactions.occurredAt, filter.to) : undefined,
    search ? like(transactions.description, `%${search}%`) : undefined,
  ].filter((condition) => condition !== undefined);
}

export function listTransactions(
  filter?: TransactionFilter & { limit?: number; offset?: number },
) {
  const conditions = transactionFilterConditions(filter);

  const query = db.select().from(transactions).orderBy(desc(transactions.occurredAt));
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;

  if (filter?.limit !== undefined) {
    return filtered.limit(filter.limit).offset(filter.offset ?? 0);
  }

  return filtered;
}

export function countTransactions(filter?: TransactionFilter) {
  const conditions = transactionFilterConditions(filter);

  const query = db.select({ count: count() }).from(transactions);

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

export async function splitAndAllocateExpenseToIncomeTank(input: {
  expenseRuleId: number;
  incomeRuleId: number;
  sectionId: number;
  label: string;
  allocatedAmount: number;
  remainderAmount: number;
  frequency: RecurringFrequency;
  customIntervalValue?: number | null;
  customIntervalUnit?: CustomIntervalUnit | null;
  currentDueDate: Date;
}) {
  await archiveRecurringRule(input.expenseRuleId);

  const [continuedRule] = await createRecurringRule({
    sectionId: input.sectionId,
    label: input.label,
    kind: 'expense',
    frequency: input.frequency,
    customIntervalValue: input.customIntervalValue ?? null,
    customIntervalUnit: input.customIntervalUnit ?? null,
    isVariableAmount: false,
    estimatedAmount: input.allocatedAmount,
    nextDueDate: advanceDate(
      input.currentDueDate,
      input.frequency,
      input.customIntervalValue,
      input.customIntervalUnit,
    ),
  });

  await createRecurringRule({
    sectionId: input.sectionId,
    label: input.label,
    kind: 'expense',
    frequency: input.frequency,
    customIntervalValue: input.customIntervalValue ?? null,
    customIntervalUnit: input.customIntervalUnit ?? null,
    isVariableAmount: false,
    estimatedAmount: input.remainderAmount,
    nextDueDate: input.currentDueDate,
  });

  const [transaction] = await createTransaction({
    sectionId: input.sectionId,
    amount: input.allocatedAmount,
    kind: 'expense',
    description: input.label,
    occurredAt: new Date(),
    recurringRuleId: continuedRule.id,
    allocatedIncomeRuleId: input.incomeRuleId,
  });

  return transaction;
}

export async function confirmRecurringOccurrences(input: {
  ruleId: number;
  sectionId: number;
  kind: TransactionKind;
  description?: string;
  allocatedIncomeRuleId?: number | null;
  occurrences: { occurredAt: Date; amount: number }[];
  nextDueDate: Date;
}) {
  const created = [];
  for (const occurrence of input.occurrences) {
    const [transaction] = await createTransaction({
      sectionId: input.sectionId,
      amount: occurrence.amount,
      kind: input.kind,
      description: input.description,
      occurredAt: occurrence.occurredAt,
      recurringRuleId: input.ruleId,
      allocatedIncomeRuleId: input.allocatedIncomeRuleId ?? undefined,
    });
    created.push(transaction);
  }

  await updateNextDueDate(input.ruleId, input.nextDueDate);

  return created;
}
