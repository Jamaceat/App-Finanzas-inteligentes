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

function stepBack(
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
};

type Transaction = {
  amount: number;
  kind: 'income' | 'expense';
  occurredAt: Date;
  recurringRuleId: number | null;
  allocatedIncomeRuleId: number | null;
};

function sumInWindow(
  transactions: Transaction[],
  predicate: (transaction: Transaction) => boolean,
  window: { start: Date; end: Date },
) {
  return transactions
    .filter((t) => predicate(t) && t.occurredAt >= window.start && t.occurredAt < window.end)
    .reduce((total, t) => total + t.amount, 0);
}

export type IncomeTank = {
  ruleId: number;
  sectionId: number;
  label: string;
  capacity: number;
  level: number;
};

export function computeIncomeTanks(rules: Rule[], transactions: Transaction[]): IncomeTank[] {
  return rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt)
    .map((rule) => {
      const window = getCycleWindow(rule);
      const received = sumInWindow(
        transactions,
        (t) => t.kind === 'income' && t.recurringRuleId === rule.id,
        window,
      );
      const allocated = sumInWindow(
        transactions,
        (t) => t.kind === 'expense' && t.allocatedIncomeRuleId === rule.id,
        window,
      );
      return {
        ruleId: rule.id,
        sectionId: rule.sectionId,
        label: rule.label,
        capacity: rule.isVariableAmount ? received : (rule.estimatedAmount ?? received),
        level: Math.max(0, received - allocated),
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

  // 1. Free/non-recurring incomes (all time)
  const freeIncomeAllTime = transactions
    .filter((t) => t.kind === 'income' && t.recurringRuleId === null)
    .reduce((sum, t) => sum + t.amount, 0);

  // 2. Free/non-recurring expenses (all time)
  // Note: Only count expenses that are not allocated to any active recurring rule
  const freeExpenseAllTime = transactions
    .filter((t) => t.kind === 'expense' && t.allocatedIncomeRuleId === null)
    .reduce((sum, t) => sum + t.amount, 0);

  // 3. Leftover from closed cycles of active recurring income rules
  const activeRulesLeftover = rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt)
    .reduce((total, rule) => {
      const { start: currentStart } = getCycleWindow(rule);
      let cycleEnd = currentStart;
      let ruleLeftover = 0;
      let iterations = 0;

      // Find oldest transaction to set a sensible boundary
      const oldestTxDate = transactions.reduce(
        (oldest, t) => (t.occurredAt < oldest ? t.occurredAt : oldest),
        new Date(),
      );

      while (cycleEnd > oldestTxDate && iterations < 500) {
        iterations++;
        const cycleStart = stepBack(
          cycleEnd,
          rule.frequency,
          rule.customIntervalValue,
          rule.customIntervalUnit,
        );
        const window = { start: cycleStart, end: cycleEnd };
        const received = sumInWindow(
          transactions,
          (t) => t.kind === 'income' && t.recurringRuleId === rule.id,
          window,
        );
        const allocated = sumInWindow(
          transactions,
          (t) => t.kind === 'expense' && t.allocatedIncomeRuleId === rule.id,
          window,
        );
        ruleLeftover += Math.max(0, received - allocated);
        cycleEnd = cycleStart;
      }
      return total + ruleLeftover;
    }, 0);

  // 4. Leftover from archived rules
  const archivedIncomes = transactions
    .filter(
      (t) =>
        t.kind === 'income' &&
        t.recurringRuleId !== null &&
        !activeRuleIds.has(t.recurringRuleId),
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const archivedExpenses = transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.allocatedIncomeRuleId !== null &&
        !activeRuleIds.has(t.allocatedIncomeRuleId),
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const archivedLeftover = Math.max(0, archivedIncomes - archivedExpenses);

  // Level is: all free incomes minus all free expenses plus leftovers from closed active and archived cycles
  const level = Math.max(0, freeIncomeAllTime - freeExpenseAllTime) + activeRulesLeftover + archivedLeftover;

  // Capacity is the non-recurring incomes in the current window
  const now = new Date();
  const window = { start: windowStart, end: now };
  const freeIncomeInWindow = sumInWindow(
    transactions,
    (t) => t.kind === 'income' && t.recurringRuleId === null,
    window,
  );

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
    .filter((rule) => rule.kind === 'expense' && !rule.archivedAt && rule.nextDueDate < now)
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
      };
    });
}
