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
        capacity: received,
        level: Math.max(0, received - allocated),
      };
    });
}

export function computeFreeCash(rules: Rule[], transactions: Transaction[]): number {
  const freeIncome = transactions
    .filter((t) => t.kind === 'income' && t.recurringRuleId === null)
    .reduce((total, t) => total + t.amount, 0);
  const freeExpense = transactions
    .filter((t) => t.kind === 'expense' && t.recurringRuleId === null)
    .reduce((total, t) => total + t.amount, 0);

  const leftoverFromClosedCycles = rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt)
    .reduce((total, rule) => {
      const window = getPreviousCycleWindow(rule);
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
      return total + Math.max(0, received - allocated);
    }, 0);

  return freeIncome - freeExpense + leftoverFromClosedCycles;
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
