import { and, count, desc, eq, gte, isNull, like, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import {
  archiveRecurringRule,
  createRecurringRule,
  updateNextDueDate,
  updatePlannedTankRuleId,
  type CustomIntervalUnit,
  type DbExecutor,
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

// Solo las columnas que consume la matemática de tanques (computeIncomeTanks /
// computeFreeCashTank / findRememberedTankId): evita cargar description y el
// resto de la fila para toda la tabla en cada refetch del live query.
export function listTankTransactions() {
  return db
    .select({
      amount: transactions.amount,
      kind: transactions.kind,
      occurredAt: transactions.occurredAt,
      recurringRuleId: transactions.recurringRuleId,
      allocatedIncomeRuleId: transactions.allocatedIncomeRuleId,
    })
    .from(transactions)
    .orderBy(desc(transactions.occurredAt));
}

export type TankTransaction = Awaited<ReturnType<typeof listTankTransactions>>[number];

export function countTransactions(filter?: TransactionFilter) {
  const conditions = transactionFilterConditions(filter);

  const query = db.select({ count: count() }).from(transactions);

  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

export function createTransaction(
  input: {
    sectionId: number;
    amount: number;
    kind: TransactionKind;
    description?: string;
    occurredAt: Date;
    recurringRuleId?: number;
    allocatedIncomeRuleId?: number;
  },
  executor: DbExecutor = db,
) {
  return executor.insert(transactions).values(input).returning();
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
  // Un solo commit para archive + 2 creates: una sola notificación de cambio.
  return db.transaction((tx) => {
    try {
      archiveRecurringRule(input.expenseRuleId, tx).run();

      const [continuedRule] = createRecurringRule(
        {
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
        },
        tx,
      ).all();

      createRecurringRule(
        {
          sectionId: input.sectionId,
          label: input.label,
          kind: 'expense',
          frequency: input.frequency,
          customIntervalValue: input.customIntervalValue ?? null,
          customIntervalUnit: input.customIntervalUnit ?? null,
          isVariableAmount: false,
          estimatedAmount: input.remainderAmount,
          nextDueDate: input.currentDueDate,
        },
        tx,
      ).run();

      return continuedRule;
    } catch (err) {
      console.error("splitAndAssignExpenseToTank transaction error:", err);
      throw err;
    }
  });
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
  // Un solo commit para los N inserts + updates de la regla: sin esto, cada await
  // autocommitea y dispara una ola de refetch de todos los useLiveQuery montados.
  return db.transaction((tx) => {
    const created = [];
    for (const occurrence of input.occurrences) {
      const [transaction] = createTransaction(
        {
          sectionId: input.sectionId,
          amount: occurrence.amount,
          kind: input.kind,
          description: input.description,
          occurredAt: occurrence.occurredAt,
          recurringRuleId: input.ruleId,
          allocatedIncomeRuleId: input.allocatedIncomeRuleId ?? undefined,
        },
        tx,
      ).all();
      created.push(transaction);
    }

    updateNextDueDate(input.ruleId, input.nextDueDate, tx).run();

    // Recordar el tanque usado para este ciclo como plan del próximo: así el gasto ya
    // aparece con el tanque preseleccionado la próxima vez, sin tener que reasignarlo.
    if (input.kind === 'expense' && input.allocatedIncomeRuleId) {
      updatePlannedTankRuleId(input.ruleId, input.allocatedIncomeRuleId, tx).run();
    }

    return created;
  });
}
