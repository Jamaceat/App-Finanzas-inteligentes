import { createContext, useContext, type ReactNode } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { listActiveRecurringRules } from '@/db/queries/recurring-rules';
import { listActiveSections } from '@/db/queries/sections';
import { watchAppSettingsRow } from '@/db/queries/settings';
import { listTankTransactions } from '@/db/queries/transactions';

type ActiveRules = Awaited<ReturnType<typeof listActiveRecurringRules>>;
type ActiveSections = Awaited<ReturnType<typeof listActiveSections>>;
type AppSettingsRows = Awaited<ReturnType<typeof watchAppSettingsRow>>;
type TankTransactions = Awaited<ReturnType<typeof listTankTransactions>>;

// Un solo useLiveQuery por dataset compartido para toda la app. Antes cada
// pantalla montada (los tabs quedan todos montados) corría su propia copia del
// mismo query, así que cada escritura disparaba 4-6 refetches idénticos.
// Contextos separados: un cambio en un dataset solo re-renderiza a sus
// consumidores, igual que cuando cada pantalla tenía su propio useLiveQuery.
const ActiveRulesContext = createContext<ActiveRules | null>(null);
const ActiveSectionsContext = createContext<ActiveSections | null>(null);
const AppSettingsRowsContext = createContext<AppSettingsRows | null>(null);
const TankTransactionsContext = createContext<TankTransactions | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { data: activeRules } = useLiveQuery(listActiveRecurringRules());
  const { data: activeSections } = useLiveQuery(listActiveSections());
  const { data: settingsRows } = useLiveQuery(watchAppSettingsRow());
  const { data: tankTransactions } = useLiveQuery(listTankTransactions());

  return (
    <ActiveRulesContext.Provider value={activeRules}>
      <ActiveSectionsContext.Provider value={activeSections}>
        <AppSettingsRowsContext.Provider value={settingsRows}>
          <TankTransactionsContext.Provider value={tankTransactions}>
            {children}
          </TankTransactionsContext.Provider>
        </AppSettingsRowsContext.Provider>
      </ActiveSectionsContext.Provider>
    </ActiveRulesContext.Provider>
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
