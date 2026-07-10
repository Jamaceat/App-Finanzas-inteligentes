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

export function getCycleWindow(rule: IntervalRule & { nextDueDate: Date }, referenceDate: Date = new Date()) {
  let end = rule.nextDueDate;
  while (end < referenceDate) {
    const next = advanceDate(end, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit);
    if (next.getTime() <= end.getTime()) {
      break;
    }
    end = next;
  }
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
  tankKind: 'normal' | 'special';
  specialTankExpenseId: number | null;
  previousRuleId: number | null;
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

export type RuleLineageRow = { id: number; previousRuleId: number | null };

// Editar una regla archiva la versión anterior y encadena la nueva vía previousRuleId
// (ver replaceRecurringRule). Sin este mapeo, el dinero ya confirmado bajo la versión
// vieja quedaría "huérfano": desaparecería de su tanque (la regla que lo generó ya no
// está activa) y computeFreeCashTank lo trataría como sobrante de una regla dada de
// baja, empujándolo a Libre de inmediato — aunque el ciclo actual de la regla editada
// todavía no haya terminado. Este mapa hace que toda transacción de un ancestro
// archivado cuente como si perteneciera a la regla activa que lo reemplazó.
function buildLineageHeadMap(
  allRules: RuleLineageRow[],
  activeRuleIds: Iterable<number>,
): Map<number, number> {
  const rulesById = new Map(allRules.map((r) => [r.id, r]));
  const headByAncestorId = new Map<number, number>();
  for (const activeId of activeRuleIds) {
    const visited = new Set<number>([activeId]);
    let currentId = rulesById.get(activeId)?.previousRuleId ?? null;
    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      headByAncestorId.set(currentId, activeId);
      currentId = rulesById.get(currentId)?.previousRuleId ?? null;
    }
  }
  return headByAncestorId;
}

function remapTransactionsToLineageHead(
  transactions: Transaction[],
  headByAncestorId: Map<number, number>,
): Transaction[] {
  if (headByAncestorId.size === 0) return transactions;
  return transactions.map((t) => {
    const recurringRuleId =
      t.recurringRuleId !== null ? (headByAncestorId.get(t.recurringRuleId) ?? t.recurringRuleId) : t.recurringRuleId;
    const allocatedIncomeRuleId =
      t.allocatedIncomeRuleId !== null
        ? (headByAncestorId.get(t.allocatedIncomeRuleId) ?? t.allocatedIncomeRuleId)
        : t.allocatedIncomeRuleId;
    if (recurringRuleId === t.recurringRuleId && allocatedIncomeRuleId === t.allocatedIncomeRuleId) {
      return t;
    }
    return { ...t, recurringRuleId, allocatedIncomeRuleId };
  });
}

export function computeIncomeTanks(
  rules: Rule[],
  transactions: Transaction[],
  allRules?: RuleLineageRow[],
): IncomeTank[] {
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

  const effectiveTransactions = allRules
    ? remapTransactionsToLineageHead(transactions, buildLineageHeadMap(allRules, rules.map((r) => r.id)))
    : transactions;
  const index = indexTankTransactions(effectiveTransactions);

  return rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt && rule.tankKind !== 'special')
    .map((rule) => {
      const window = getCycleWindow(rule, now);
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
  allRules?: RuleLineageRow[],
): FreeCashTank {
  const now = new Date();
  const activeRuleIds = new Set(rules.map((r) => r.id));
  const effectiveTransactions = allRules
    ? remapTransactionsToLineageHead(transactions, buildLineageHeadMap(allRules, activeRuleIds))
    : transactions;
  const index = indexTankTransactions(effectiveTransactions);

  // 1. Free/non-recurring incomes (all time)
  const freeIncomeAllTime = index.freeIncomeAllTime;

  // 2. Free/non-recurring expenses (all time)
  // Note: Only count expenses that are not allocated to any active recurring rule
  const freeExpenseAllTime = index.freeExpenseAllTime;

  // Boundary for the per-rule cycle walk below (hoisted: it only depends on
  // the transactions, not on the rule).
  const oldestTxDate = index.oldestTxDate;

  // Gastos ya planificados (asignados a un tanque) pero todavía no confirmados:
  // necesarios para calcular el déficit del ciclo en curso de cada tanque de ingreso.
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

  // 3. Leftover from closed cycles of active recurring income rules, plus deficit of current cycle.
  // Note: Special tanks are excluded since they are funded from Libre via specialTanksReserved.
  const activeRulesNet = rules
    .filter((rule) => rule.kind === 'income' && !rule.archivedAt && rule.tankKind !== 'special')
    .reduce((total, rule) => {
      const ruleIncomes = index.incomeByRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS;
      const ruleAllocated = index.expenseByAllocatedRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS;
      
      // Calculate current cycle balance and deficit
      const { start: currentStart } = getCycleWindow(rule, now);
      const currentReceived = sumInWindow(ruleIncomes, { start: currentStart, end: now });
      const currentAllocated = sumInWindow(ruleAllocated, { start: currentStart, end: now });
      const currentReserved = plannedByTank.get(rule.id) ?? 0;

      const currentBalance = currentReceived - currentAllocated - currentReserved;
      const currentDeficit = Math.min(0, currentBalance);

      // Calculate closed cycles leftovers (without capping to 0 per cycle)
      let cycleEnd = currentStart;
      let ruleLeftover = 0;

      while (cycleEnd > oldestTxDate) {
        const cycleStart = stepBack(
          cycleEnd,
          rule.frequency,
          rule.customIntervalValue,
          rule.customIntervalUnit,
        );
        if (cycleStart.getTime() >= cycleEnd.getTime()) {
          break;
        }
        const window = { start: cycleStart, end: cycleEnd };
        const received = sumInWindow(ruleIncomes, window);
        const allocated = sumInWindow(ruleAllocated, window);
        ruleLeftover += (received - allocated);
        cycleEnd = cycleStart;
      }
      return total + ruleLeftover + currentDeficit;
    }, 0);

  // 4. Leftover from archived rules
  const archivedIncomes = index.recurringIncomes
    .filter((t) => t.recurringRuleId !== null && !activeRuleIds.has(t.recurringRuleId))
    .reduce((sum, t) => sum + t.amount, 0);

  const archivedExpenses = index.allocatedExpenses
    .filter((t) => t.allocatedIncomeRuleId !== null && !activeRuleIds.has(t.allocatedIncomeRuleId))
    .reduce((sum, t) => sum + t.amount, 0);

  const archivedLeftover = archivedIncomes - archivedExpenses;

  // 5. Capital ya comprometido en tanques especiales temporales (ver
  // computeSpecialTanks): se resta la capacidad completa, no el nivel restante, porque
  // esa plata queda reservada para su gasto dueño desde el momento en que se crea el
  // tanque, aunque todavía no se haya gastado.
  const specialTanksReserved = rules
    .filter(
      (rule) =>
        rule.kind === 'income' && rule.tankKind === 'special' && !rule.archivedAt && rule.nextDueDate > now,
    )
    .reduce((sum, rule) => sum + (rule.estimatedAmount ?? 0), 0);

  // Level is: all free incomes minus all free expenses plus net cash from active and archived recurring rules
  const level = Math.max(
    0,
    (freeIncomeAllTime - freeExpenseAllTime) +
      activeRulesNet +
      archivedLeftover -
      specialTanksReserved,
  );

  // Capacity is the non-recurring incomes in the current window
  const window = { start: windowStart, end: now };
  const freeIncomeInWindow = sumInWindow(index.freeIncomes, window);

  return {
    capacity: Math.max(freeIncomeInWindow, 1),
    level,
  };
}

export type SpecialTank = {
  ruleId: number;
  sectionId: number;
  label: string;
  expenseRuleId: number;
  capacity: number;
  level: number;
  expiresAt: Date;
};

// Tanques especiales temporales activos (ver comentario en schema.ts): uno por gasto
// dueño, financiados con capital ya restado de Libre en computeFreeCashTank. El label
// lleva un índice que se recalcula sobre el conjunto activo (ordenado por id), así los
// números se reciclan solos cuando un tanque expira/se archiva, sin guardar nada extra.
export function computeSpecialTanks(rules: Rule[], transactions: Transaction[]): SpecialTank[] {
  const now = new Date();
  const index = indexTankTransactions(transactions);

  const active = rules
    .filter(
      (rule) =>
        rule.kind === 'income' && rule.tankKind === 'special' && !rule.archivedAt && rule.nextDueDate > now,
    )
    .sort((a, b) => a.id - b.id);

  return active.map((rule, i) => {
    const allocated = (index.expenseByAllocatedRuleId.get(rule.id) ?? EMPTY_TRANSACTIONS).reduce(
      (sum, t) => sum + t.amount,
      0,
    );
    const capacity = rule.estimatedAmount ?? 0;
    return {
      ruleId: rule.id,
      sectionId: rule.sectionId,
      label: `Tanque especial #${i + 1}`,
      expenseRuleId: rule.specialTankExpenseId as number,
      capacity,
      level: Math.max(0, capacity - allocated),
      expiresAt: rule.nextDueDate,
    };
  });
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

function dayKey(date: Date): number {
  return Math.floor(date.getTime() / 86400000);
}

// Editar una regla archiva la versión anterior y encadena la nueva vía
// previousRuleId (ver replaceRecurringRule). Este índice agrupa, por regla, los
// días que ya tienen una transacción confirmada — sin importar qué versión de la
// regla la generó — para poder excluirlos al recalcular pendientes tras un cambio
// de frecuencia con fecha de inicio retroactiva.
function indexConfirmedDateKeysByRuleId(transactions: Transaction[]): Map<number, Set<number>> {
  const index = new Map<number, Set<number>>();
  for (const t of transactions) {
    if (t.recurringRuleId === null) continue;
    const set = index.get(t.recurringRuleId);
    if (set) set.add(dayKey(t.occurredAt));
    else index.set(t.recurringRuleId, new Set([dayKey(t.occurredAt)]));
  }
  return index;
}

function confirmedDateKeysForLineage(
  ruleId: number,
  rulesById: Map<number, { previousRuleId: number | null }>,
  confirmedByRuleId: Map<number, Set<number>>,
): Set<number> {
  const keys = new Set<number>();
  const visited = new Set<number>();
  let currentId: number | null = ruleId;
  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);
    const confirmed = confirmedByRuleId.get(currentId);
    if (confirmed) for (const key of confirmed) keys.add(key);
    currentId = rulesById.get(currentId)?.previousRuleId ?? null;
  }
  return keys;
}

export type RuleLineageContext = {
  // Todas las reglas (incluidas las archivadas) con al menos id/previousRuleId,
  // necesarias para reconstruir el linaje de una regla editada.
  allRules: { id: number; previousRuleId: number | null }[];
  transactions: Transaction[];
};

export function computePendingConfirmations(
  rules: Rule[],
  kind: 'income' | 'expense',
  lineage?: RuleLineageContext,
): PendingConfirmation[] {
  const now = new Date();
  const rulesById = lineage ? new Map(lineage.allRules.map((r) => [r.id, r])) : null;
  const confirmedByRuleId = lineage ? indexConfirmedDateKeysByRuleId(lineage.transactions) : null;

  return rules
    .filter(
      (rule) =>
        rule.kind === kind && !rule.archivedAt && rule.nextDueDate < now && rule.tankKind !== 'special',
    )
    .map((rule) => {
      const excludedKeys =
        rulesById && confirmedByRuleId
          ? confirmedDateKeysForLineage(rule.id, rulesById, confirmedByRuleId)
          : null;
      const occurrences: Date[] = [];
      let current = rule.nextDueDate;
      while (current < now) {
        if (!excludedKeys?.has(dayKey(current))) {
          occurrences.push(current);
        }
        const next = advanceDate(current, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit);
        if (next.getTime() <= current.getTime()) {
          break;
        }
        current = next;
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
    })
    // Una regla puede quedar sin ocurrencias si todos sus ciclos vencidos ya se
    // habían confirmado bajo una versión anterior (ver excludedKeys arriba).
    .filter((confirmation) => confirmation.occurrences.length > 0);
}
