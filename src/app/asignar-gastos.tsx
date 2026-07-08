import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FloatingExpensePoint, type MiniTankTarget, POINT_WIDTH, POINT_HEIGHT } from '@/components/floating-expense-point';
import { PocketWidget } from '@/components/pocket-widget';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { TANK_COLOR } from '@/constants/constants';
import { listActiveRecurringRules } from '@/db/queries/recurring-rules';
import { listActiveSections } from '@/db/queries/sections';
import {
  allocateExpenseToIncomeTank,
  assignTransactionToIncomeTank,
  listAssignedExpenseTransactions,
  listTransactions,
  listUnassignedExpenseTransactions,
  unassignTransactionFromIncomeTank,
} from '@/db/queries/transactions';
import { computeIncomeTanks, computePendingExpenses, type PendingExpense } from '@/db/queries/tanks';
import { watchAppSettingsRow } from '@/db/queries/settings';
import { useBubbleFrontOrder } from '@/hooks/use-bubble-front-order';

const EXPENSE_POINT_COLOR = '#E5484D';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRatio(seed: number, salt: number): number {
  const x = Math.sin(seed + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function AsignarGastosScreen() {
  const { data: rules } = useLiveQuery(listActiveRecurringRules());
  const { data: transactions } = useLiveQuery(listTransactions());
  const { data: unassignedTransactions } = useLiveQuery(listUnassignedExpenseTransactions());
  const { data: assignedTransactions } = useLiveQuery(listAssignedExpenseTransactions());
  const { data: sections } = useLiveQuery(listActiveSections());
  const { data: settingsRows } = useLiveQuery(watchAppSettingsRow());
  const { width, height } = useWindowDimensions();

  const vibrationEnabled = settingsRows?.[0]?.vibrationEnabled ?? true;

  const navigation = useNavigation();
  const [isWidgetCollapsed, setIsWidgetCollapsed] = useState(true);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: isWidgetCollapsed,
    });
  }, [navigation, isWidgetCollapsed]);

  const [focusedPointKey, setFocusedPointKey] = useState<string | null>(null);
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});
  const { bringToFront, getZIndex } = useBubbleFrontOrder();

  const incomeTanks = useMemo(() => computeIncomeTanks(rules, transactions), [rules, transactions]);
  const pendingExpenses = useMemo(() => computePendingExpenses(rules), [rules]);

  const tanks: MiniTankTarget[] = useMemo(
    () => incomeTanks.map((tank) => ({ ruleId: tank.ruleId, label: tank.label, color: TANK_COLOR })),
    [incomeTanks],
  );

  const pocketExpenses = useMemo(
    () =>
      (assignedTransactions || [])
        .filter((transaction) => transaction.allocatedIncomeRuleId !== null)
        .map((transaction) => ({
          id: transaction.id,
          label: transaction.description || 'Gasto',
          amount: transaction.amount,
          occurredAt: transaction.occurredAt,
          incomeRuleId: transaction.allocatedIncomeRuleId as number,
        })),
    [assignedTransactions],
  );

  async function handleAllocateRule(expense: PendingExpense, incomeRuleId: number) {
    await allocateExpenseToIncomeTank({
      expenseRuleId: expense.ruleId,
      incomeRuleId,
      sectionId: expense.sectionId,
      amount: expense.estimatedAmount ?? 0,
      frequency: expense.frequency,
      customIntervalValue: expense.customIntervalValue,
      customIntervalUnit: expense.customIntervalUnit,
      nextDueDate: expense.nextDueDate,
      description: expense.label,
    });
  }

  function formatCompactCurrency(amount: number): string {
    if (amount >= 1_000_000) {
      const val = amount / 1_000_000;
      return `$${val.toFixed(val % 1 === 0 ? 0 : 1)}M`;
    }
    if (amount >= 1_000) {
      const val = amount / 1_000;
      return `$${val.toFixed(val % 1 === 0 ? 0 : 1)}K`;
    }
    return formatCurrency(amount);
  }

  const points = useMemo(() => {
    const rulePoints = pendingExpenses.map((expense) => {
      const section = (sections || []).find((s) => s.id === expense.sectionId);
      return {
        key: `rule-${expense.ruleId}`,
        label: expense.label,
        amountLabel: expense.isVariableAmount
          ? 'Var.'
          : formatCompactCurrency(expense.estimatedAmount ?? 0),
        fullAmountLabel: expense.isVariableAmount
          ? 'Monto variable'
          : formatCurrency(expense.estimatedAmount ?? 0),
        sectionColor: section?.color,
        sectionIcon: section?.icon,
        isVariable: expense.isVariableAmount,
        rawAmount: expense.estimatedAmount ?? 0,
        frequency: expense.frequency,
        nextDueDate: expense.nextDueDate,
        onAssign: (incomeRuleId: number) => handleAllocateRule(expense, incomeRuleId),
      };
    });
    const transactionPoints = unassignedTransactions.map((transaction) => {
      const section = (sections || []).find((s) => s.id === transaction.sectionId);
      return {
        key: `tx-${transaction.id}`,
        label: transaction.description || 'Gasto',
        amountLabel: formatCompactCurrency(transaction.amount),
        fullAmountLabel: formatCurrency(transaction.amount),
        sectionColor: section?.color,
        sectionIcon: section?.icon,
        isVariable: false,
        rawAmount: transaction.amount,
        frequency: undefined,
        nextDueDate: transaction.occurredAt,
        onAssign: (incomeRuleId: number) =>
          assignTransactionToIncomeTank(transaction.id, incomeRuleId),
      };
    });
    return [...rulePoints, ...transactionPoints];
  }, [pendingExpenses, unassignedTransactions, sections]);

  const usableTop = 160;
  const usableBottom = height - BottomTabInset - Spacing.four;

  const seededPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const point of points) {
      const seed = hashString(point.key);
      map.set(point.key, {
        x: 80 + seededRatio(seed, 1) * Math.max(1, width - 160),
        y: usableTop + seededRatio(seed, 2) * Math.max(1, usableBottom - usableTop),
      });
    }
    return map;
  }, [points, width, usableTop, usableBottom]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const point of points) {
      if (customPositions[point.key]) {
        const pos = customPositions[point.key];
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(width - POINT_WIDTH / 2, pos.x));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(height - BottomTabInset - Spacing.four, pos.y));
        map.set(point.key, { x: clampedX, y: clampedY });
      } else {
        const seeded = seededPositions.get(point.key);
        if (seeded) {
          map.set(point.key, seeded);
        }
      }
    }
    return map;
  }, [points, customPositions, seededPositions, width, height]);

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, { opacity: focusedPointKey !== null ? 0.15 : 1 }]} edges={['top']}>
          <ThemedText type="title" style={styles.title}>
            Asignar gastos
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Tocá un gasto y arrastralo hasta el tanque del que sale.
          </ThemedText>

          {points.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No hay gastos sin asignar.
            </ThemedText>
          )}
          {points.length > 0 && tanks.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              Creá una regla de ingreso recurrente en Secciones para poder asignar estos gastos.
            </ThemedText>
          )}
        </SafeAreaView>

        {focusedPointKey !== null && (
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 }
            ]}
            onPress={() => setFocusedPointKey(null)}
          />
        )}

        <View style={styles.pointsLayer} pointerEvents="box-none">
          {points.map((point) => {
            const origin = positions.get(point.key);
            const initial = seededPositions.get(point.key);
            if (!origin || !initial) return null;
            return (
              <FloatingExpensePoint
                key={point.key}
                pointKey={point.key}
                label={point.label}
                amountLabel={point.amountLabel}
                fullAmountLabel={point.fullAmountLabel}
                sectionColor={point.sectionColor}
                sectionIcon={point.sectionIcon}
                isVariable={point.isVariable}
                rawAmount={point.rawAmount}
                frequency={point.frequency}
                nextDueDate={point.nextDueDate}
                color={EXPENSE_POINT_COLOR}
                tanks={tanks}
                originX={origin.x}
                originY={origin.y}
                initialX={initial.x}
                initialY={initial.y}
                focusedPointKey={focusedPointKey}
                onSetFocused={setFocusedPointKey}
                onAssign={point.onAssign}
                vibrationEnabled={vibrationEnabled}
                onPositionChange={(key: string, x: number, y: number) => {
                  setCustomPositions((prev) => ({ ...prev, [key]: { x, y } }));
                }}
                zIndex={getZIndex(point.key)}
                onInteractionStart={() => bringToFront(point.key)}
              />
            );
          })}
        </View>

        <PocketWidget
          tanks={tanks}
          expenses={pocketExpenses}
          onUnassign={(expenseId) => unassignTransactionFromIncomeTank(expenseId)}
          vibrationEnabled={vibrationEnabled}
          onCollapsedChange={setIsWidgetCollapsed}
        />
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    paddingBottom: Spacing.two,
  },
  emptyText: {
    paddingTop: Spacing.four,
    textAlign: 'center',
  },
  pointsLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
