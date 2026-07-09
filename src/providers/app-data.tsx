import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import {
  listActiveRecurringRules,
  listAllRecurringRules,
  pruneExpiredSpecialTanks,
} from '@/db/queries/recurring-rules';
import { listActiveSections } from '@/db/queries/sections';
import { watchAppSettingsRow } from '@/db/queries/settings';
import { listTankTransactions } from '@/db/queries/transactions';

type ActiveRules = Awaited<ReturnType<typeof listActiveRecurringRules>>;
type AllRules = Awaited<ReturnType<typeof listAllRecurringRules>>;
type ActiveSections = Awaited<ReturnType<typeof listActiveSections>>;
type AppSettingsRows = Awaited<ReturnType<typeof watchAppSettingsRow>>;
type TankTransactions = Awaited<ReturnType<typeof listTankTransactions>>;

// Un solo useLiveQuery por dataset compartido para toda la app. Antes cada
// pantalla montada (los tabs quedan todos montados) corría su propia copia del
// mismo query, así que cada escritura disparaba 4-6 refetches idénticos.
// Contextos separados: un cambio en un dataset solo re-renderiza a sus
// consumidores, igual que cuando cada pantalla tenía su propio useLiveQuery.
const ActiveRulesContext = createContext<ActiveRules | null>(null);
const AllRulesContext = createContext<AllRules | null>(null);
const ActiveSectionsContext = createContext<ActiveSections | null>(null);
const AppSettingsRowsContext = createContext<AppSettingsRows | null>(null);
const TankTransactionsContext = createContext<TankTransactions | null>(null);
const AppDataReloadContext = createContext<(() => void) | null>(null);

function AppDataProviderInner({ children }: { children: ReactNode }) {
  const { data: activeRules } = useLiveQuery(listActiveRecurringRules({ includeSpecialTanks: true }));
  const { data: allRules } = useLiveQuery(listAllRecurringRules());
  const { data: activeSections } = useLiveQuery(listActiveSections());
  const { data: settingsRows } = useLiveQuery(watchAppSettingsRow());
  const { data: tankTransactions } = useLiveQuery(listTankTransactions());

  // Un tanque especial temporal deja de existir en el próximo cobro del gasto que lo
  // generó (ver schema.ts / computeSpecialTanks): se archiva y se libera el gasto para
  // que vuelva a flotar como burbuja pendiente. Se revisa acá, centralizado, cada vez
  // que cambian las reglas activas.
  useEffect(() => {
    const expiredIds = activeRules
      .filter((rule) => rule.kind === 'income' && rule.tankKind === 'special' && rule.nextDueDate <= new Date())
      .map((rule) => rule.id);
    if (expiredIds.length > 0) {
      Promise.resolve(pruneExpiredSpecialTanks(expiredIds)).catch(console.error);
    }
  }, [activeRules]);

  return (
    <ActiveRulesContext.Provider value={activeRules}>
      <AllRulesContext.Provider value={allRules}>
        <ActiveSectionsContext.Provider value={activeSections}>
          <AppSettingsRowsContext.Provider value={settingsRows}>
            <TankTransactionsContext.Provider value={tankTransactions}>
              {children}
            </TankTransactionsContext.Provider>
          </AppSettingsRowsContext.Provider>
        </ActiveSectionsContext.Provider>
      </AllRulesContext.Provider>
    </ActiveRulesContext.Provider>
  );
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [reloadKey, setReloadKey] = useState(0);

  const reloadApp = () => {
    setReloadKey((prev) => prev + 1);
  };

  return (
    <AppDataReloadContext.Provider value={reloadApp}>
      <AppDataProviderInner key={reloadKey}>
        {children}
      </AppDataProviderInner>
    </AppDataReloadContext.Provider>
  );
}

function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (value === null) {
    throw new Error(`${name} debe usarse dentro de AppDataProvider`);
  }
  return value;
}

/** Reglas recurrentes activas (sin archivar), vivas ante cambios en la tabla. */
export function useActiveRules(): ActiveRules {
  return useRequiredContext(ActiveRulesContext, 'useActiveRules');
}

/** Todas las reglas recurrentes, incluidas las archivadas (para reconstruir linaje). */
export function useAllRules(): AllRules {
  return useRequiredContext(AllRulesContext, 'useAllRules');
}

/** Secciones activas (sin archivar), vivas ante cambios en la tabla. */
export function useActiveSections(): ActiveSections {
  return useRequiredContext(ActiveSectionsContext, 'useActiveSections');
}

/** Fila de app_settings (array de 0 o 1 elementos), viva ante cambios. */
export function useAppSettingsRows(): AppSettingsRows {
  return useRequiredContext(AppSettingsRowsContext, 'useAppSettingsRows');
}

/** Transacciones con solo las columnas de la matemática de tanques, vivas ante cambios. */
export function useTankTransactions(): TankTransactions {
  return useRequiredContext(TankTransactionsContext, 'useTankTransactions');
}

/** Obtiene la función para forzar la recarga completa del contexto y pantallas de la app. */
export function useReloadApp(): () => void {
  const value = useContext(AppDataReloadContext);
  if (value === null) {
    throw new Error('useReloadApp debe usarse dentro de AppDataProvider');
  }
  return value;
}
