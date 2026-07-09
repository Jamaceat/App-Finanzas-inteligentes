import { and, count, desc, eq, gte, isNull, like, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import {
  archiveRecurringRule,
  createRecurringRule,
  updateNextDueDate,
  updatePlannedTankRuleId,
  type CustomIntervalUnit,
  type RecurringFrequency,
} from '@/db/queries/recurring-rules';

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

// Asignar un gasto recurrente a un tanque en asignar-gastos/Home es solo planificar de
// dónde va a salir la plata: no crea transacción ni avanza nextDueDate. El gasto sigue
// pendiente de confirmar (visible en la pestaña Confirmar) hasta que el usuario lo
// confirma ahí de verdad.
export async function assignExpenseToTank(input: { expenseRuleId: number; incomeRuleId: number }) {
  return updatePlannedTankRuleId(input.expenseRuleId, input.incomeRuleId);
}

// Sacar un gasto del tanque en el Bolsillo: como asignar nunca creó una transacción,
// alcanza con limpiar la planificación para que vuelva a flotar como burbuja pendiente.
export function unassignExpenseFromTank(expenseRuleId: number) {
  return updatePlannedTankRuleId(expenseRuleId, null);
}

// El disponible del tanque no alcanza para todo el gasto: se parte la regla recurrente en
// dos desde este ciclo. La parte "continuada" (allocatedAmount) queda planificada en el
// tanque elegido sin confirmar todavía; la parte "remanente" queda sin asignar, vencida,
// para que el usuario la asigne a otro tanque.
export async function splitAndAssignExpenseToTank(input: {
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
    nextDueDate: input.currentDueDate,
    plannedTankRuleId: input.incomeRuleId,
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

  return continuedRule;
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

  // Recordar el tanque usado para este ciclo como plan del próximo: así el gasto ya
  // aparece con el tanque preseleccionado la próxima vez, sin tener que reasignarlo.
  if (input.kind === 'expense' && input.allocatedIncomeRuleId) {
    await updatePlannedTankRuleId(input.ruleId, input.allocatedIncomeRuleId);
  }

  return created;
}
