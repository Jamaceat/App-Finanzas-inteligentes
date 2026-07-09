import { and, count, desc, eq, gte, isNotNull, isNull, like, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { transactions, recurringRules } from '@/db/schema';
import {
  archiveRecurringRule,
  createRecurringRule,
  updateNextDueDate,
  type CustomIntervalUnit,
  type RecurringFrequency,
} from '@/db/queries/recurring-rules';
import { advanceDate, stepBack } from '@/db/queries/tanks';

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

// Sacar un gasto del tanque: si viene de una regla recurrente (allocateExpenseToIncomeTank
// ya adelantó nextDueDate al asignarlo), hay que revertir ese avance para que el gasto
// vuelva a aparecer como burbuja pendiente en "asignar gastos", y borrar la transacción
// para no dejarla huérfana (contando como gasto libre y duplicándose si se reasigna).
//
// Ojo: la misma regla puede haber sido pagada de nuevo después (vía otra asignación o
// vía "Confirmar", que también puede alocar a un tanque y procesar varios ciclos vencidos
// de una sola vez). Si esta transacción no es la última registrada para la regla, ese
// período posterior ya está pagado y revertir nextDueDate lo dejaría "pendiente" de nuevo
// (doble pago / calendario roto). En ese caso solo se desvincula del tanque sin tocar la regla.
export async function unassignTransactionFromIncomeTank(
  transactionId: number,
): Promise<{ periodAlreadySettled: boolean }> {
  const [transaction] = await db.select().from(transactions).where(eq(transactions.id, transactionId));

  if (transaction && transaction.kind === 'expense' && transaction.recurringRuleId !== null) {
    const [latest] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.recurringRuleId, transaction.recurringRuleId))
      .orderBy(desc(transactions.id))
      .limit(1);

    if (latest?.id === transaction.id) {
      const [rule] = await db
        .select()
        .from(recurringRules)
        .where(eq(recurringRules.id, transaction.recurringRuleId));

      if (rule && !rule.archivedAt) {
        await updateNextDueDate(
          rule.id,
          stepBack(rule.nextDueDate, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit),
        );
        await db.delete(transactions).where(eq(transactions.id, transactionId));
        return { periodAlreadySettled: false };
      }
    } else {
      await db
        .update(transactions)
        .set({ allocatedIncomeRuleId: null })
        .where(eq(transactions.id, transactionId));
      return { periodAlreadySettled: true };
    }
  }

  await db
    .update(transactions)
    .set({ allocatedIncomeRuleId: null })
    .where(eq(transactions.id, transactionId));
  return { periodAlreadySettled: false };
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
