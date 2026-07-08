import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Pressable, useWindowDimensions, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FloatingExpensePoint, type MiniTankTarget, POINT_WIDTH, POINT_HEIGHT } from '@/components/floating-expense-point';
import { FloatingClusterBubble } from '@/components/floating-cluster-bubble';
import { PocketWidget } from '@/components/pocket-widget';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  TANK_COLOR,
  BUBBLE_PILL_SCALE_MIN,
  BUBBLE_PILL_SCALE_MAX,
  CLUSTER_SCALE_MIN,
  CLUSTER_SCALE_MAX,
  CLUSTER_BASE_SIZE,
  MAX_FLOATING_BUBBLES,
  MAX_BUBBLES_PER_CLUSTER,
  MAX_CLUSTERS_ON_SCREEN,
  CLUSTER_EXPAND_BACKDROP_OPACITY,
  DUE_SOON_WINDOW_DAYS,
  OVERDUE_SEVERE_DAYS,
} from '@/constants/constants';
import { listActiveRecurringRules } from '@/db/queries/recurring-rules';
import { DEFAULT_SECTION_NAME, listActiveSections } from '@/db/queries/sections';
import {
  allocateExpenseToIncomeTank,
  listAssignedExpenseTransactions,
  listTransactions,
  splitAndAllocateExpenseToIncomeTank,
  unassignTransactionFromIncomeTank,
} from '@/db/queries/transactions';
import { computeIncomeTanks, computePendingExpenses, type PendingExpense } from '@/db/queries/tanks';
import { watchAppSettingsRow } from '@/db/queries/settings';
import { useBubbleFrontOrder } from '@/hooks/use-bubble-front-order';
import { useTheme } from '@/hooks/use-theme';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';
import { bubbleScale, referenceAmount, urgencyForDate } from '@/lib/bubble-visuals';
import {
  buildBubbleTree,
  childrenAt,
  prunePath,
  type AssignablePoint,
  type BubbleNode,
  type ClusterNode,
  type LeafNode,
} from '@/lib/bubble-clusters';

const EXPENSE_POINT_COLOR = '#E5484D';

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

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function collectClusterTotals(nodes: BubbleNode[]): number[] {
  const totals: number[] = [];
  for (const node of nodes) {
    if (node.kind === 'cluster') {
      totals.push(node.totalAmount);
      totals.push(...collectClusterTotals(node.children));
    }
  }
  return totals;
}

export default function AsignarGastosScreen() {
  const theme = useTheme();
  const { data: rules } = useLiveQuery(listActiveRecurringRules());
  const { data: transactions } = useLiveQuery(listTransactions());
  const { data: assignedTransactions } = useLiveQuery(listAssignedExpenseTransactions());
  const { data: sections } = useLiveQuery(listActiveSections());
  const { data: settingsRows } = useLiveQuery(watchAppSettingsRow());
  const { width, height } = useWindowDimensions();

  const vibrationEnabled = settingsRows?.[0]?.vibrationEnabled ?? true;
  const allowPartialAssignment = settingsRows?.[0]?.allowPartialTankAssignment ?? false;

  const navigation = useNavigation();
  const [isWidgetCollapsed, setIsWidgetCollapsed] = useState(true);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: isWidgetCollapsed,
    });
  }, [navigation, isWidgetCollapsed]);

  const [focusedPointKey, setFocusedPointKey] = useState<string | null>(null);
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [expandedPath, setExpandedPath] = useState<string[]>([]);
  const { bringToFront, getZIndex } = useBubbleFrontOrder();

  const incomeTanks = useMemo(() => computeIncomeTanks(rules, transactions), [rules, transactions]);
  const pendingExpenses = useMemo(() => computePendingExpenses(rules), [rules]);

  const tanks: MiniTankTarget[] = useMemo(
    () =>
      incomeTanks.map((tank) => ({
        ruleId: tank.ruleId,
        label: tank.label,
        color: TANK_COLOR,
        level: tank.level,
        capacity: tank.capacity,
      })),
    [incomeTanks],
  );

  const totalAvailable = useMemo(() => incomeTanks.reduce((sum, tank) => sum + tank.level, 0), [incomeTanks]);
  const totalCapacity = useMemo(
    () => incomeTanks.reduce((sum, tank) => sum + Math.max(tank.capacity, 1), 0),
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

  async function handleAllocateRule(expense: PendingExpense, incomeRuleId: number, allocatedAmount: number) {
    const fullAmount = expense.estimatedAmount ?? 0;

    if (allocatedAmount >= fullAmount) {
      await allocateExpenseToIncomeTank({
        expenseRuleId: expense.ruleId,
        incomeRuleId,
        sectionId: expense.sectionId,
        amount: fullAmount,
        frequency: expense.frequency,
        customIntervalValue: expense.customIntervalValue,
        customIntervalUnit: expense.customIntervalUnit,
        nextDueDate: expense.nextDueDate,
        description: expense.label,
      });
      return;
    }

    // El disponible del tanque no alcanza para todo el gasto: se parte la
    // regla recurrente en dos desde este ciclo (ver splitAndAllocateExpenseToIncomeTank).
    await splitAndAllocateExpenseToIncomeTank({
      expenseRuleId: expense.ruleId,
      incomeRuleId,
      sectionId: expense.sectionId,
      label: expense.label,
      allocatedAmount,
      remainderAmount: fullAmount - allocatedAmount,
      frequency: expense.frequency,
      customIntervalValue: expense.customIntervalValue,
      customIntervalUnit: expense.customIntervalUnit,
      currentDueDate: expense.nextDueDate,
    });
  }

  // Las burbujas son solo para gastos de reglas recurrentes: una transacción
  // puntual ya queda asignada a un tanque (o a "Libre" por defecto) al crearse
  // en el formulario, así que no necesita pasar por esta pantalla.
  const points: AssignablePoint[] = useMemo(() => {
    const now = new Date();
    return pendingExpenses.map((expense) => {
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
        sectionId: expense.sectionId,
        sectionName: section?.name ?? DEFAULT_SECTION_NAME,
        sectionColor: section?.color,
        sectionIcon: section?.icon,
        isVariable: expense.isVariableAmount,
        rawAmount: expense.estimatedAmount ?? 0,
        frequency: expense.frequency,
        nextDueDate: expense.nextDueDate,
        // Las reglas recurrentes ya vienen vencidas (nextDueDate < now); el aro
        // distingue "recién cayó" (ámbar) de "lleva días sin asignar" (rojo).
        urgency: urgencyForDate(expense.nextDueDate, now, DUE_SOON_WINDOW_DAYS, OVERDUE_SEVERE_DAYS),
        onAssign: (incomeRuleId: number, allocatedAmount: number) =>
          handleAllocateRule(expense, incomeRuleId, allocatedAmount),
      };
    });
  }, [pendingExpenses, sections]);

  const amountReference = useMemo(() => referenceAmount(points.map((p) => p.rawAmount)), [points]);

  const summary = useMemo(() => {
    let total = 0;
    let variableCount = 0;
    for (const point of points) {
      if (point.isVariable) variableCount += 1;
      else total += point.rawAmount;
    }
    return { total, variableCount };
  }, [points]);

  const tree = useMemo(
    () =>
      buildBubbleTree(points, {
        maxFloating: MAX_FLOATING_BUBBLES,
        maxPerCluster: MAX_BUBBLES_PER_CLUSTER,
        maxClusters: MAX_CLUSTERS_ON_SCREEN,
      }),
    [points],
  );

  const clusterAmountReference = useMemo(() => referenceAmount(collectClusterTotals(tree)), [tree]);

  // Si el árbol cambió (p. ej. se asignó el último gasto de un cluster
  // expandido) y el path dejó de ser válido, lo recortamos durante el render
  // en vez de en un efecto, siguiendo el idiom de usePagination.
  const prunedPath = prunePath(tree, expandedPath);
  if (!arraysEqual(prunedPath, expandedPath)) {
    setExpandedPath(prunedPath);
  }
  const currentPath = prunedPath;

  const parentPath = currentPath.slice(0, -1);
  const parentLevelNodes = childrenAt(tree, parentPath);
  const activeChildren = currentPath.length > 0 ? childrenAt(tree, currentPath) : [];
  const isParentLevelDimmed = currentPath.length > 0;
  const expandedParentKey = currentPath[currentPath.length - 1];
  const expandedParentNode = expandedParentKey
    ? parentLevelNodes.find((node) => node.key === expandedParentKey)
    : undefined;

  const breadcrumb = useMemo(() => {
    const labels: string[] = [];
    let level = tree;
    for (const key of currentPath) {
      const node = level.find((n) => n.key === key);
      if (!node || node.kind !== 'cluster') break;
      labels.push(node.label);
      level = node.children;
    }
    return labels.join(' · ');
  }, [tree, currentPath]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (focusedPointKey !== null) {
        setFocusedPointKey(null);
        return true;
      }
      if (currentPath.length > 0) {
        setExpandedPath((prev) => prev.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [focusedPointKey, currentPath]);

  const usableTop = 160;
  const usableBottom = height - BottomTabInset - Spacing.four;

  function seededPositionForKey(key: string): { x: number; y: number } {
    const seed = hashString(key);
    return {
      x: 80 + seededRatio(seed, 1) * Math.max(1, width - 160),
      y: usableTop + seededRatio(seed, 2) * Math.max(1, usableBottom - usableTop),
    };
  }

  function halfExtentFor(node: BubbleNode): { halfW: number; halfH: number } {
    return node.kind === 'leaf'
      ? { halfW: POINT_WIDTH / 2, halfH: POINT_HEIGHT / 2 }
      : { halfW: CLUSTER_BASE_SIZE / 2, halfH: CLUSTER_BASE_SIZE / 2 };
  }

  function originForNode(node: BubbleNode): { x: number; y: number } {
    const { halfW, halfH } = halfExtentFor(node);
    const custom = customPositions[node.key];
    if (custom) {
      return {
        x: Math.max(halfW, Math.min(width - halfW, custom.x)),
        y: Math.max(halfH, Math.min(height - BottomTabInset - Spacing.four, custom.y)),
      };
    }
    return seededPositionForKey(node.key);
  }

  const burstOrigin = expandedParentNode ? originForNode(expandedParentNode) : null;

  function handlePositionChange(key: string, x: number, y: number) {
    setCustomPositions((prev) => ({ ...prev, [key]: { x, y } }));
  }

  function renderLeafNode(node: LeafNode, initial: { x: number; y: number }, dimmed: boolean) {
    const origin = originForNode(node);
    return (
      <FloatingExpensePoint
        key={node.key}
        pointKey={node.key}
        label={node.point.label}
        amountLabel={node.point.amountLabel}
        fullAmountLabel={node.point.fullAmountLabel}
        sectionColor={node.point.sectionColor}
        sectionIcon={node.point.sectionIcon}
        isVariable={node.point.isVariable}
        rawAmount={node.point.rawAmount}
        frequency={node.point.frequency}
        nextDueDate={node.point.nextDueDate}
        color={EXPENSE_POINT_COLOR}
        tanks={tanks}
        originX={origin.x}
        originY={origin.y}
        initialX={initial.x}
        initialY={initial.y}
        focusedPointKey={focusedPointKey}
        onSetFocused={setFocusedPointKey}
        onAssign={node.point.onAssign}
        vibrationEnabled={vibrationEnabled}
        onPositionChange={handlePositionChange}
        zIndex={getZIndex(node.key)}
        onInteractionStart={() => bringToFront(node.key)}
        sizeScale={bubbleScale(node.point.rawAmount, amountReference, BUBBLE_PILL_SCALE_MIN, BUBBLE_PILL_SCALE_MAX)}
        urgency={node.point.urgency}
        forceDimmed={dimmed}
        allowPartialAssignment={allowPartialAssignment}
      />
    );
  }

  function renderClusterNode(node: ClusterNode, initial: { x: number; y: number }, dimmed: boolean) {
    const origin = originForNode(node);
    const variableSuffix = node.variableCount > 0 ? ` (+${node.variableCount} var.)` : '';
    const sublabel = `${node.count} ${node.count === 1 ? 'gasto' : 'gastos'} · ${formatCompactCurrency(node.totalAmount)}${variableSuffix}`;
    return (
      <FloatingClusterBubble
        key={node.key}
        nodeKey={node.key}
        label={node.label}
        sublabel={sublabel}
        count={node.count}
        icon={node.icon}
        color={node.color ?? EXPENSE_POINT_COLOR}
        urgency={node.urgency}
        sizeScale={bubbleScale(node.totalAmount, clusterAmountReference, CLUSTER_SCALE_MIN, CLUSTER_SCALE_MAX)}
        originX={origin.x}
        originY={origin.y}
        initialX={initial.x}
        initialY={initial.y}
        isDimmed={dimmed}
        vibrationEnabled={vibrationEnabled}
        zIndex={getZIndex(node.key)}
        onInteractionStart={() => bringToFront(node.key)}
        onExpand={() => setExpandedPath((prev) => [...prev, node.key])}
        onPositionChange={handlePositionChange}
      />
    );
  }

  function renderNode(node: BubbleNode, initial: { x: number; y: number }, dimmed: boolean) {
    return node.kind === 'leaf' ? renderLeafNode(node, initial, dimmed) : renderClusterNode(node, initial, dimmed);
  }

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

          {points.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.summaryPill}>
              <View style={styles.summaryRow}>
                <ThemedText type="smallBold">
                  {points.length} {points.length === 1 ? 'gasto' : 'gastos'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {' · '}
                  {formatCompactCurrency(summary.total)} por asignar
                  {summary.variableCount > 0 ? ` (+${summary.variableCount} var.)` : ''}
                </ThemedText>
              </View>
            </ThemedView>
          )}

          {breadcrumb.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.breadcrumb}>
              {breadcrumb}
            </ThemedText>
          )}

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

        {currentPath.length > 0 && (
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: `rgba(0,0,0,${CLUSTER_EXPAND_BACKDROP_OPACITY})`, zIndex: 5 },
            ]}
            onPress={() => setExpandedPath((prev) => prev.slice(0, -1))}
          />
        )}

        {focusedPointKey !== null && (
          <Pressable
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10 }
            ]}
            onPress={() => setFocusedPointKey(null)}
          />
        )}

        {focusedPointKey !== null && (
          <SafeAreaView style={styles.availableBarSafeArea} edges={['top']} pointerEvents="none">
            <ThemedView type="backgroundElement" style={styles.availableBar}>
              <ThemedText type="smallBold">{`Disponible: ${formatCurrency(totalAvailable)}`}</ThemedText>
              <View style={[styles.availableBarTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.availableBarFill,
                    {
                      width: `${Math.max(0, Math.min(100, (totalAvailable / totalCapacity) * 100))}%`,
                      backgroundColor: TANK_COLOR,
                    },
                  ]}
                />
              </View>
            </ThemedView>
          </SafeAreaView>
        )}

        <View style={styles.pointsLayer} pointerEvents="box-none">
          {parentLevelNodes.map((node) => renderNode(node, seededPositionForKey(node.key), isParentLevelDimmed))}
        </View>

        {currentPath.length > 0 && (
          <View style={[styles.pointsLayer, styles.activeChildrenLayer]} pointerEvents="box-none">
            {activeChildren.map((node) => renderNode(node, burstOrigin ?? seededPositionForKey(node.key), false))}
          </View>
        )}

        <PocketWidget
          tanks={tanks}
          expenses={pocketExpenses}
          onUnassign={async (expenseId) => {
            await unassignTransactionFromIncomeTank(expenseId);
          }}
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
  summaryPill: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  breadcrumb: {
    paddingTop: Spacing.one,
  },
  availableBarSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  availableBar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  availableBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  availableBarFill: {
    height: '100%',
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
  activeChildrenLayer: {
    zIndex: 6,
  },
});
