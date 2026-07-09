import type { CustomIntervalUnit, RecurringFrequency } from '@/db/queries/recurring-rules';

type IntervalRule = {
  frequency: RecurringFrequency;
  customIntervalValue?: number | null;
  customIntervalUnit?: CustomIntervalUnit | null;
};

export function advanceDate(
  date: Date,
  frequency: RecurringFrequency,
  customIntervalValue?: number | null,
  customIntervalUnit?: CustomIntervalUnit | null,
): Date {
  const next = new Date(date);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 15);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semiannual':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'custom': {
      const amount = customIntervalValue && customIntervalValue > 0 ? customIntervalValue : 1;
      const days = customIntervalUnit === 'weeks' ? amount * 7 : amount;
      next.setDate(next.getDate() + days);
      break;
    }
  }
  return next;
}

export function stepBack(
  date: Date,
  frequency: RecurringFrequency,
  customIntervalValue?: number | null,
  customIntervalUnit?: CustomIntervalUnit | null,
): Date {
  const prev = new Date(date);
  switch (frequency) {
    case 'daily':
      prev.setDate(prev.getDate() - 1);
      break;
    case 'weekly':
      prev.setDate(prev.getDate() - 7);
      break;
    case 'biweekly':
      prev.setDate(prev.getDate() - 15);
      break;
    case 'monthly':
      prev.setMonth(prev.getMonth() - 1);
      break;
    case 'quarterly':
      prev.setMonth(prev.getMonth() - 3);
      break;
    case 'semiannual':
      prev.setMonth(prev.getMonth() - 6);
      break;
    case 'yearly':
      prev.setFullYear(prev.getFullYear() - 1);
      break;
    case 'custom': {
      const amount = customIntervalValue && customIntervalValue > 0 ? customIntervalValue : 1;
      const days = customIntervalUnit === 'weeks' ? amount * 7 : amount;
      prev.setDate(prev.getDate() - days);
      break;
    }
  }
  return prev;
}

export function getCycleWindow(rule: IntervalRule & { nextDueDate: Date }) {
  const end = rule.nextDueDate;
  const start = stepBack(end, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit);
  return { start, end };
}

export function getPreviousCycleWindow(rule: IntervalRule & { nextDueDate: Date }) {
  const { start: currentStart } = getCycleWindow(rule);
  const start = stepBack(
    currentStart,
    rule.frequency,
    rule.customIntervalValue,
    rule.customIntervalUnit,
  );
  return { start, end: currentStart };
}

export type SettingsIntervalUnit = 'days' | 'weeks' | 'months' | 'years';

export function addInterval(date: Date, value: number, unit: SettingsIntervalUnit): Date {
  const next = new Date(date);
  switch (unit) {
    case 'days':
      next.setDate(next.getDate() + value);
      break;
    case 'weeks':
      next.setDate(next.getDate() + value * 7);
      break;
    case 'months':
      next.setMonth(next.getMonth() + value);
      break;
    case 'years':
      next.setFullYear(next.getFullYear() + value);
      break;
  }
  return next;
}

type Rule = {
  id: number;
  sectionId: number;
  label: string;
  kind: 'income' | 'expense';
  frequency: RecurringFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: CustomIntervalUnit | null;
  isVariableAmount: boolean;
  estimatedAmount: number | null;
  nextDueDate: Date;
  archivedAt: Date | null;
  plannedTankRuleId: number | null;
};

type Transaction = {
  amount: number;
  kind: 'income' | 'expense';
  occurredAt: Date;
  recurringRuleId: number | null;
  allocatedIncomeRuleId: number | null;
};

const EMPTY_TRANSACTIONS: Transaction[] = [];

// Índice de una sola pasada sobre las transacciones para que los cómputos de
// tanques no re-escaneen el array completo por cada regla/ciclo. Los arrays
// preservan el orden original, así las sumas por subconjunto dan exactamente
// el mismo resultado que filtrar el array completo.
type TankTransactionsIndex = {
  incomeByRuleId: Map<number, Transaction[]>;
  expenseByAllocatedRuleId: Map<number, Transaction[]>;
  recurringIncomes: Transaction[];
  allocatedExpenses: Transaction[];
  freeIncomes: Transaction[];
  freeIncomeAllTime: number;
  freeExpenseAllTime: number;
  oldestTxDate: Date;
};

function indexTankTransactions(transactions: Transaction[]): TankTransactionsIndex {
  const incomeByRuleId = new Map<number, Transaction[]>();
  const expenseByAllocatedRuleId = new Map<number, Transaction[]>();
  const recurringIncomes: Transaction[] = [];
  const allocatedExpenses: Transaction[] = [];
  const freeIncomes: Transaction[] = [];
  let freeIncomeAllTime = 0;
  let freeExpenseAllTime = 0;
  let oldestTxDate = new Date();

  for (const t of transactions) {
    if (t.occurredAt < oldestTxDate) oldestTxDate = t.occurredAt;

    if (t.kind === 'income') {
      if (t.recurringRuleId === null) {
        freeIncomes.push(t);
        freeIncomeAllTime += t.amount;
      } else {
        recurringIncomes.push(t);
        const list = incomeByRuleId.get(t.recurringRuleId);
        if (list) list.push(t);
        else incomeByRuleId.set(t.recurringRuleId, [t]);
      }
    } else {
      if (t.allocatedIncomeRuleId === null) {
        freeExpenseAllTime += t.amount;
      } else {
        allocatedExpenses.push(t);
        const list = expenseByAllocatedRuleId.get(t.allocatedIncomeRuleId);
        if (list) list.push(t);
        else expenseByAllocatedRuleId.set(t.allocatedIncomeRuleId, [t]);
      }
    }
  }

  return {
    incomeByRuleId,
    expenseByAllocatedRuleId,
    recurringIncomes,
    allocatedExpenses,
    freeIncomes,
    freeIncomeAllTime,
    freeExpenseAllTime,
    oldestTxDate,
  };
}

function sumInWindow(transactions: Transaction[], window: { start: Date; end: Date }) {
  let total = 0;
  for (const t of transactions) {
    if (t.occurredAt >= window.start && t.occurredAt < window.end) total += t.amount;
  }
  return total;
}

export type IncomeTank = {
  ruleId: number;
  sectionId: number;
  label: string;
  capacity: number;
  level: number;
};

export function computeIncomeTanks(rules: Rule[], transactions: Transaction[]): IncomeTank[] {
  const now = new Date();
  // Gastos ya planificados (asignados a un tanque) pero todavía no confirmados: se
  // descuentan del nivel disponible como si ya estuvieran comprometidos, aunque todavía
  // no exista una transacción real. En cuanto se confirman, nextDueDate avanza y salen
  // de este filtro, así que no se descuentan dos veces (la transacción real ya creada
  // pasa a contar vía `allocated`).
  const plannedByTank = new Map<number, number>();
  for (const rule of rules) {
    if (
      rule.kind === 'expense' &&
      !rule.archivedAt &&
      rule.plannedTankRuleId !== null &&
      rule.nextDueDate < now
    ) {
      const current = plannedByTank.get(rule.plannedTankRuleId) ?? 0;
      plannedByTank.set(rule.plannedTankRuleId, current + (rule.estimatedAmount ?? 0));
    }
  }

  const index = indexTankTransactions(transactions);

  return rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt)
    .map((rule) => {
      const window = getCycleWindow(rule);
      const received = sumInWindow(index.incomeByRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS, window);
      const allocated = sumInWindow(
        index.expenseByAllocatedRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS,
        window,
      );
      const reserved = plannedByTank.get(rule.id) ?? 0;
      return {
        ruleId: rule.id,
        sectionId: rule.sectionId,
        label: rule.label,
        capacity: rule.isVariableAmount ? received : (rule.estimatedAmount ?? received),
        level: Math.max(0, received - allocated - reserved),
      };
    });
}

export type FreeCashTank = {
  capacity: number;
  level: number;
};

export function computeFreeCashTank(
  rules: Rule[],
  transactions: Transaction[],
  windowStart: Date,
): FreeCashTank {
  const activeRuleIds = new Set(rules.map((r) => r.id));
  const index = indexTankTransactions(transactions);

  // 1. Free/non-recurring incomes (all time)
  const freeIncomeAllTime = index.freeIncomeAllTime;

  // 2. Free/non-recurring expenses (all time)
  // Note: Only count expenses that are not allocated to any active recurring rule
  const freeExpenseAllTime = index.freeExpenseAllTime;

  // Boundary for the per-rule cycle walk below (hoisted: it only depends on
  // the transactions, not on the rule).
  const oldestTxDate = index.oldestTxDate;

  // 3. Leftover from closed cycles of active recurring income rules
  const activeRulesLeftover = rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt)
    .reduce((total, rule) => {
      const ruleIncomes = index.incomeByRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS;
      const ruleAllocated = index.expenseByAllocatedRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS;
      const { start: currentStart } = getCycleWindow(rule);
      let cycleEnd = currentStart;
      let ruleLeftover = 0;
      let iterations = 0;

      while (cycleEnd > oldestTxDate && iterations < 500) {
        iterations++;
        const cycleStart = stepBack(
          cycleEnd,
          rule.frequency,
          rule.customIntervalValue,
          rule.customIntervalUnit,
        );
        const window = { start: cycleStart, end: cycleEnd };
        const received = sumInWindow(ruleIncomes, window);
        const allocated = sumInWindow(ruleAllocated, window);
        ruleLeftover += Math.max(0, received - allocated);
        cycleEnd = cycleStart;
      }
      return total + ruleLeftover;
    }, 0);

  // 4. Leftover from archived rules
  const archivedIncomes = index.recurringIncomes
    .filter((t) => t.recurringRuleId !== null && !activeRuleIds.has(t.recurringRuleId))
    .reduce((sum, t) => sum + t.amount, 0);

  const archivedExpenses = index.allocatedExpenses
    .filter((t) => t.allocatedIncomeRuleId !== null && !activeRuleIds.has(t.allocatedIncomeRuleId))
    .reduce((sum, t) => sum + t.amount, 0);

  const archivedLeftover = Math.max(0, archivedIncomes - archivedExpenses);

  // Level is: all free incomes minus all free expenses plus leftovers from closed active and archived cycles
  const level = Math.max(0, freeIncomeAllTime - freeExpenseAllTime) + activeRulesLeftover + archivedLeftover;

  // Capacity is the non-recurring incomes in the current window
  const now = new Date();
  const window = { start: windowStart, end: now };
  const freeIncomeInWindow = sumInWindow(index.freeIncomes, window);

  return {
    capacity: Math.max(freeIncomeInWindow, 1),
    level,
  };
}

export type PendingExpense = {
  ruleId: number;
  sectionId: number;
  label: string;
  isVariableAmount: boolean;
  estimatedAmount: number | null;
  frequency: RecurringFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: CustomIntervalUnit | null;
  nextDueDate: Date;
};

export function computePendingExpenses(rules: Rule[]): PendingExpense[] {
  const now = new Date();
  return rules
    .filter(
      (rule) =>
        rule.kind === 'expense' &&
        !rule.archivedAt &&
        rule.nextDueDate < now &&
        rule.plannedTankRuleId === null,
    )
    .map((rule) => ({
      ruleId: rule.id,
      sectionId: rule.sectionId,
      label: rule.label,
      isVariableAmount: rule.isVariableAmount,
      estimatedAmount: rule.estimatedAmount,
      frequency: rule.frequency,
      customIntervalValue: rule.customIntervalValue,
      customIntervalUnit: rule.customIntervalUnit,
      nextDueDate: rule.nextDueDate,
    }));
}

export type PlannedExpense = {
  ruleId: number;
  sectionId: number;
  label: string;
  estimatedAmount: number | null;
  nextDueDate: Date;
  plannedTankRuleId: number;
};

// Gastos ya asignados a un tanque (arrastrados en asignar-gastos/Home) pero todavía sin
// confirmar: son los que se muestran "adentro" del tanque en el Bolsillo.
export function computePlannedExpenses(rules: Rule[]): PlannedExpense[] {
  const now = new Date();
  return rules
    .filter(
      (rule) =>
        rule.kind === 'expense' &&
        !rule.archivedAt &&
        rule.nextDueDate < now &&
        rule.plannedTankRuleId !== null,
    )
    .map((rule) => ({
      ruleId: rule.id,
      sectionId: rule.sectionId,
      label: rule.label,
      estimatedAmount: rule.estimatedAmount,
      nextDueDate: rule.nextDueDate,
      plannedTankRuleId: rule.plannedTankRuleId as number,
    }));
}

export type PendingConfirmation = {
  ruleId: number;
  sectionId: number;
  label: string;
  kind: 'income' | 'expense';
  isVariableAmount: boolean;
  estimatedAmount: number | null;
  frequency: RecurringFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: CustomIntervalUnit | null;
  occurrences: Date[];
  nextDueAfter: Date;
  plannedTankRuleId: number | null;
};

export function computePendingConfirmations(
  rules: Rule[],
  kind: 'income' | 'expense',
): PendingConfirmation[] {
  const now = new Date();
  return rules
    .filter((rule) => rule.kind === kind && !rule.archivedAt && rule.nextDueDate < now)
    .map((rule) => {
      const occurrences: Date[] = [];
      let current = rule.nextDueDate;
      let iterations = 0;
      while (current < now && iterations < 500) {
        occurrences.push(current);
        current = advanceDate(current, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit);
        iterations++;
      }
      return {
        ruleId: rule.id,
        sectionId: rule.sectionId,
        label: rule.label,
        kind,
        isVariableAmount: rule.isVariableAmount,
        estimatedAmount: rule.estimatedAmount,
        frequency: rule.frequency,
        customIntervalValue: rule.customIntervalValue,
        customIntervalUnit: rule.customIntervalUnit,
        occurrences,
        nextDueAfter: current,
        plannedTankRuleId: rule.plannedTankRuleId,
      };
    });
}
