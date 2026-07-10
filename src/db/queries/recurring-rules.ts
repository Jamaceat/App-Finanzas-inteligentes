import { and, count, eq, inArray, isNull, like, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { recurringRules } from '@/db/schema';

// El callback de db.transaction del driver expo-sqlite es síncrono: adentro hay que
// ejecutar con .all()/.run() (no await), si no el COMMIT corre antes que las queries.
export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export type RecurringFrequency = (typeof recurringRules.$inferSelect)['frequency'];
export type RecurringKind = (typeof recurringRules.$inferSelect)['kind'];
export type CustomIntervalUnit = NonNullable<
  (typeof recurringRules.$inferSelect)['customIntervalUnit']
>;
export type TankKind = (typeof recurringRules.$inferSelect)['tankKind'];

// nextDueDate es solo una fecha de ciclo (la unidad mínima es el día): se normaliza a
// medianoche hora local en cada write para que no arrastre la hora exacta en la que se
// creó/editó/avanzó la regla (eso rompía las comparaciones de "vencido" contra `now`,
// corriendo el vencimiento real a esa hora del día en vez de al inicio del día). El
// instante exacto del cambio se audita aparte en `updatedAt`.
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export type RecurringRuleFilter = {
  kind?: RecurringKind;
  search?: string;
  // Los tanques especiales temporales (ver computeSpecialTanks) no son reglas
  // editables por el usuario: se excluyen de listados/conteos salvo que se pidan
  // explícitamente (AppDataProvider los necesita para la matemática de tanques).
  includeSpecialTanks?: boolean;
};

function recurringRuleFilterConditions(filter?: RecurringRuleFilter) {
  const search = filter?.search?.trim();
  return [
    isNull(recurringRules.archivedAt),
    filter?.kind !== undefined ? eq(recurringRules.kind, filter.kind) : undefined,
    search ? like(recurringRules.label, `%${search}%`) : undefined,
    filter?.includeSpecialTanks ? undefined : ne(recurringRules.tankKind, 'special'),
  ].filter((condition) => condition !== undefined);
}

export function listAllRecurringRules() {
  return db.select().from(recurringRules);
}

export function listActiveRecurringRules(
  filter?: RecurringRuleFilter & { limit?: number; offset?: number },
) {
  const query = db
    .select()
    .from(recurringRules)
    .where(and(...recurringRuleFilterConditions(filter)));

  if (filter?.limit !== undefined) {
    return query.limit(filter.limit).offset(filter.offset ?? 0);
  }

  return query;
}

export function countActiveRecurringRules(filter?: RecurringRuleFilter) {
  return db
    .select({ count: count() })
    .from(recurringRules)
    .where(and(...recurringRuleFilterConditions(filter)));
}

export type CreateRecurringRuleInput = {
  sectionId: number;
  label: string;
  kind: RecurringKind;
  frequency: RecurringFrequency;
  customIntervalValue?: number | null;
  customIntervalUnit?: CustomIntervalUnit | null;
  isVariableAmount: boolean;
  estimatedAmount?: number;
  nextDueDate: Date;
  reminderEnabled?: boolean;
  plannedTankRuleId?: number | null;
  tankKind?: TankKind;
  specialTankExpenseId?: number | null;
  previousRuleId?: number | null;
};

export function createRecurringRule(input: CreateRecurringRuleInput, executor: DbExecutor = db) {
  return executor
    .insert(recurringRules)
    .values({ ...input, nextDueDate: startOfDay(input.nextDueDate), updatedAt: new Date() })
    .returning();
}

export function updateNextDueDate(id: number, nextDueDate: Date, executor: DbExecutor = db) {
  return executor
    .update(recurringRules)
    .set({ nextDueDate: startOfDay(nextDueDate), updatedAt: new Date() })
    .where(eq(recurringRules.id, id))
    .returning();
}

export function updatePlannedTankRuleId(
  id: number,
  plannedTankRuleId: number | null,
  executor: DbExecutor = db,
) {
  return executor
    .update(recurringRules)
    .set({ plannedTankRuleId, updatedAt: new Date() })
    .where(eq(recurringRules.id, id))
    .returning();
}

export function updateRecurringRule(
  id: number,
  input: Partial<{
    sectionId: number;
    label: string;
    kind: RecurringKind;
    frequency: RecurringFrequency;
    customIntervalValue: number | null;
    customIntervalUnit: CustomIntervalUnit | null;
    isVariableAmount: boolean;
    estimatedAmount: number | null;
    nextDueDate: Date;
    reminderEnabled: boolean;
  }>,
) {
  return db
    .update(recurringRules)
    .set({
      ...input,
      nextDueDate: input.nextDueDate ? startOfDay(input.nextDueDate) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(recurringRules.id, id))
    .returning();
}

// Los tanques especiales viven en recurring_rules (kind='income', tankKind='special')
// para reusar toda la maquinaria existente (plannedTankRuleId, allocatedIncomeRuleId,
// computeIncomeTanks/computeFreeCashTank). nextDueDate guarda su vencimiento: el
// próximo cobro del gasto dueño, momento en el que debe desaparecer (ver
// pruneExpiredSpecialTanks). El label real ("Tanque especial #N") se calcula en
// computeSpecialTanks a partir del conjunto activo, así los índices se reciclan solos.
export function createSpecialTank(
  input: { sectionId: number; expenseRuleId: number; capacity: number; expiresAt: Date },
  executor: DbExecutor = db,
) {
  return executor
    .insert(recurringRules)
    .values({
      sectionId: input.sectionId,
      label: 'Tanque especial',
      kind: 'income',
      frequency: 'custom',
      customIntervalValue: 1,
      customIntervalUnit: 'days',
      isVariableAmount: false,
      estimatedAmount: input.capacity,
      nextDueDate: startOfDay(input.expiresAt),
      reminderEnabled: false,
      tankKind: 'special',
      specialTankExpenseId: input.expenseRuleId,
      updatedAt: new Date(),
    })
    .returning();
}

// Sube la capacidad de un tanque especial ya existente (p. ej. se habían planificado
// menos ciclos de los que terminan confirmándose) y refresca su vencimiento.
export function updateSpecialTank(
  id: number,
  input: { capacity: number; expiresAt: Date },
  executor: DbExecutor = db,
) {
  return executor
    .update(recurringRules)
    .set({
      estimatedAmount: input.capacity,
      nextDueDate: startOfDay(input.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(recurringRules.id, id))
    .returning();
}

// Un tanque especial deja de existir en el próximo cobro del gasto que lo generó:
// se archiva y se libera el plannedTankRuleId del gasto (vuelve a flotar como
// burbuja pendiente en asignar-gastos). Un solo commit para todos los vencidos.
export function pruneExpiredSpecialTanks(ids: number[]) {
  if (ids.length === 0) return;
  return db.transaction((tx) => {
    tx.update(recurringRules)
      .set({ plannedTankRuleId: null, updatedAt: new Date() })
      .where(inArray(recurringRules.plannedTankRuleId, ids))
      .run();
    tx.update(recurringRules)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(inArray(recurringRules.id, ids))
      .run();
  });
}

export function archiveRecurringRule(id: number, executor: DbExecutor = db) {
  return executor
    .update(recurringRules)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(recurringRules.id, id), isNull(recurringRules.archivedAt)))
    .returning();
}

export async function replaceRecurringRule(archiveId: number, input: CreateRecurringRuleInput) {
  return db.transaction((tx) => {
    const [archived] = archiveRecurringRule(archiveId, tx).all();
    const plannedTankRuleId = archived?.plannedTankRuleId ?? null;
    const [created] = createRecurringRule(
      { ...input, previousRuleId: archiveId, plannedTankRuleId },
      tx,
    ).all();
    return created;
  });
}
