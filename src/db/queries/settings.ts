import { eq } from 'drizzle-orm';

import { DEFAULT_SIMULATION_OCCURRENCES } from '@/constants/constants';
import { db } from '@/db/client';
import { appSettings, transactions, recurringRules, savingsGoals, sections } from '@/db/schema';

export type TankMaxRenewalUnit = (typeof appSettings.$inferSelect)['tankMaxRenewalUnit'];

export type AppSettings = {
  tankMaxRenewalValue: number;
  tankMaxRenewalUnit: TankMaxRenewalUnit;
  vibrationEnabled: boolean;
  calendarSimulationOccurrences: number;
  restrictPastStartDates: boolean;
  transactionsPageSize: number;
  allowPartialTankAssignment: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  tankMaxRenewalValue: 30,
  tankMaxRenewalUnit: 'days',
  vibrationEnabled: true,
  calendarSimulationOccurrences: DEFAULT_SIMULATION_OCCURRENCES,
  restrictPastStartDates: false,
  transactionsPageSize: 20,
  allowPartialTankAssignment: false,
};

export function watchAppSettingsRow() {
  return db.select().from(appSettings).limit(1);
}

export async function getAppSettings(): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (row) return row;

  const [created] = await db.insert(appSettings).values(DEFAULT_SETTINGS).returning();
  return created;
}

export async function updateTankMaxRenewal(
  value: number,
  unit: TankMaxRenewalUnit,
): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (!row) {
    const [created] = await db
      .insert(appSettings)
      .values({ ...DEFAULT_SETTINGS, tankMaxRenewalValue: value, tankMaxRenewalUnit: unit })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(appSettings)
    .set({ tankMaxRenewalValue: value, tankMaxRenewalUnit: unit, updatedAt: new Date() })
    .where(eq(appSettings.id, row.id))
    .returning();
  return updated;
}

export async function updateVibrationEnabled(enabled: boolean): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (!row) {
    const [created] = await db
      .insert(appSettings)
      .values({ ...DEFAULT_SETTINGS, vibrationEnabled: enabled })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(appSettings)
    .set({ vibrationEnabled: enabled, updatedAt: new Date() })
    .where(eq(appSettings.id, row.id))
    .returning();
  return updated;
}

export async function updateCalendarSimulationOccurrences(occurrences: number): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (!row) {
    const [created] = await db
      .insert(appSettings)
      .values({ ...DEFAULT_SETTINGS, calendarSimulationOccurrences: occurrences })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(appSettings)
    .set({ calendarSimulationOccurrences: occurrences, updatedAt: new Date() })
    .where(eq(appSettings.id, row.id))
    .returning();
  return updated;
}

export async function updateRestrictPastStartDates(enabled: boolean): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (!row) {
    const [created] = await db
      .insert(appSettings)
      .values({ ...DEFAULT_SETTINGS, restrictPastStartDates: enabled })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(appSettings)
    .set({ restrictPastStartDates: enabled, updatedAt: new Date() })
    .where(eq(appSettings.id, row.id))
    .returning();
  return updated;
}

export async function updateTransactionsPageSize(pageSize: number): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (!row) {
    const [created] = await db
      .insert(appSettings)
      .values({ ...DEFAULT_SETTINGS, transactionsPageSize: pageSize })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(appSettings)
    .set({ transactionsPageSize: pageSize, updatedAt: new Date() })
    .where(eq(appSettings.id, row.id))
    .returning();
  return updated;
}

export async function updateAllowPartialTankAssignment(enabled: boolean): Promise<AppSettings> {
  const [row] = await watchAppSettingsRow();
  if (!row) {
    const [created] = await db
      .insert(appSettings)
      .values({ ...DEFAULT_SETTINGS, allowPartialTankAssignment: enabled })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(appSettings)
    .set({ allowPartialTankAssignment: enabled, updatedAt: new Date() })
    .where(eq(appSettings.id, row.id))
    .returning();
  return updated;
}

export async function resetAllData() {
  return db.transaction((tx) => {
    tx.delete(transactions).run();
    tx.delete(recurringRules).run();
    tx.delete(savingsGoals).run();
    tx.delete(sections).run();

    // Recreate default section
    tx.insert(sections)
      .values({
        name: 'General',
        icon: 'house',
        color: '#60646C',
        kind: 'both',
      })
      .run();
  });
}
