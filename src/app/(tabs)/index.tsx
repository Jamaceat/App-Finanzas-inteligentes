import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Children, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useDeviceTilt } from '@/hooks/use-device-tilt';
import { useTheme } from '@/hooks/use-theme';
import { listActiveRecurringRules } from '@/db/queries/recurring-rules';
import { listActiveSections } from '@/db/queries/sections';
import { listTransactions, allocateExpenseToIncomeTank } from '@/db/queries/transactions';
import {
  computeFreeCash,
  computeIncomeTanks,
  computePendingExpenses,
  type IncomeTank,
  type PendingExpense,
} from '@/db/queries/tanks';

const TANK_COLOR = '#0091FF';
const FREE_TANK_COLOR = '#12A594';

const TANK_WIDTH = 120;
const TANK_ITEM_WIDTH = 160;
const TANK_HEIGHT = 200;
const TANK_LABEL_HEIGHT = 52;
const TANK_GAP = Spacing.three;
const TANK_SNAP_INTERVAL = TANK_ITEM_WIDTH + TANK_GAP;
const TANK_CAROUSEL_HEIGHT = TANK_HEIGHT + TANK_LABEL_HEIGHT + Spacing.two;

const EDGE_ZONE_WIDTH = 44;
const EDGE_SCROLL_STEP = 14;
const EDGE_SCROLL_INTERVAL_MS = 16;

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export default function HomeScreen() {
  const { data: rules } = useLiveQuery(listActiveRecurringRules());
  const { data: transactions } = useLiveQuery(listTransactions());
  const { data: sections } = useLiveQuery(listActiveSections());
  const tilt = useDeviceTilt();
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  const incomeTanks = useMemo(() => computeIncomeTanks(rules, transactions), [rules, transactions]);
  const freeCash = useMemo(() => computeFreeCash(rules, transactions), [rules, transactions]);
  const pendingExpenses = useMemo(() => computePendingExpenses(rules), [rules]);

  const sectionFilters = useMemo(() => {
    const usedSectionIds = new Set(incomeTanks.map((tank) => tank.sectionId));
    return sections.filter((section) => usedSectionIds.has(section.id));
  }, [sections, incomeTanks]);

  const filteredIncomeTanks = useMemo(
    () =>
      selectedSectionId === null
        ? incomeTanks
        : incomeTanks.filter((tank) => tank.sectionId === selectedSectionId),
    [incomeTanks, selectedSectionId],
  );

  async function handleAllocate(expense: PendingExpense, tank: IncomeTank) {
    const amount = expense.estimatedAmount ?? 0;
    await allocateExpenseToIncomeTank({
      expenseRuleId: expense.ruleId,
      incomeRuleId: tank.ruleId,
      sectionId: expense.sectionId,
      amount,
      frequency: expense.frequency,
      customIntervalValue: expense.customIntervalValue,
      customIntervalUnit: expense.customIntervalUnit,
      nextDueDate: expense.nextDueDate,
      description: expense.label,
    });
  }

  function confirmAllocate(expense: PendingExpense, tank: IncomeTank) {
    Alert.alert(
      'Confirmar pago',
      `¿Pagar "${expense.label}" desde el tanque "${tank.label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => handleAllocate(expense, tank) },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Inicio
        </ThemedText>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterRow}>
          <FilterChip
            label="Todos"
            selected={selectedSectionId === null}
            onPress={() => setSelectedSectionId(null)}
          />
          {sectionFilters.map((section) => (
            <FilterChip
              key={section.id}
              label={section.name}
              color={section.color}
              selected={selectedSectionId === section.id}
              onPress={() => setSelectedSectionId(section.id)}
            />
          ))}
        </ScrollView>

        <TankCarousel>
          <Tank
            label="Libre"
            amount={freeCash}
            capacity={Math.max(freeCash, 1)}
            color={FREE_TANK_COLOR}
            tilt={tilt}
          />
          {filteredIncomeTanks.map((tank) => (
            <Tank
              key={tank.ruleId}
              label={tank.label}
              amount={tank.level}
              capacity={Math.max(tank.capacity, 1)}
              color={TANK_COLOR}
              tilt={tilt}
            />
          ))}
        </TankCarousel>

        <View style={styles.pendingSection}>
          <ThemedText type="smallBold">Gastos pendientes</ThemedText>
          {pendingExpenses.length === 0 && (
            <ThemedText themeColor="textSecondary" type="small">
              No hay gastos concurrentes pendientes.
            </ThemedText>
          )}
          {incomeTanks.length === 0 && pendingExpenses.length > 0 && (
            <ThemedText themeColor="textSecondary" type="small">
              Creá una regla de ingreso recurrente en Secciones para poder asignarles pagos.
            </ThemedText>
          )}
          <View style={styles.pendingList}>
            {pendingExpenses.map((expense) => (
              <PendingExpenseCard
                key={expense.ruleId}
                expense={expense}
                tanks={incomeTanks}
                onDropOnTank={(tank) => confirmAllocate(expense, tank)}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function FilterChip({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.filterChip}>
        {color && <View style={[styles.filterChipDot, { backgroundColor: color }]} />}
        <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function TankCarousel({ children }: { children: React.ReactNode }) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  function handleLayout(event: LayoutChangeEvent) {
    setContainerWidth(event.nativeEvent.layout.width);
  }

  function stopEdgeScroll() {
    if (scrollIntervalRef.current !== null) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }

  useEffect(() => stopEdgeScroll, []);

  function startEdgeScroll(direction: 1 | -1) {
    stopEdgeScroll();
    scrollIntervalRef.current = setInterval(() => {
      const nextOffset = Math.max(0, scrollX.value + direction * EDGE_SCROLL_STEP);
      scrollX.value = nextOffset;
      runOnUI(() => {
        scrollTo(scrollRef, nextOffset, 0, false);
      })();
    }, EDGE_SCROLL_INTERVAL_MS);
  }

  const items = Children.toArray(children);
  const sidePadding = Math.max(0, (containerWidth - TANK_ITEM_WIDTH) / 2);

  return (
    <View style={styles.carouselContainer} onLayout={handleLayout}>
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.tankScrollView}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={TANK_SNAP_INTERVAL}
        snapToAlignment="start"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.tankRow, { paddingHorizontal: sidePadding }]}>
        {items.map((child, index) => (
          <CoverflowItem
            key={typeof child === 'object' && 'key' in child ? (child.key ?? index) : index}
            index={index}
            scrollX={scrollX}>
            {child}
          </CoverflowItem>
        ))}
      </Animated.ScrollView>
      <Pressable
        style={[styles.edgeZone, styles.edgeZoneLeft]}
        onPressIn={() => startEdgeScroll(-1)}
        onPressOut={stopEdgeScroll}
      />
      <Pressable
        style={[styles.edgeZone, styles.edgeZoneRight]}
        onPressIn={() => startEdgeScroll(1)}
        onPressOut={stopEdgeScroll}
      />
    </View>
  );
}

function CoverflowItem({
  index,
  scrollX,
  children,
}: {
  index: number;
  scrollX: SharedValue<number>;
  children: React.ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * TANK_SNAP_INTERVAL,
      index * TANK_SNAP_INTERVAL,
      (index + 1) * TANK_SNAP_INTERVAL,
    ];
    const scale = interpolate(scrollX.value, inputRange, [0.72, 1, 0.72], Extrapolation.CLAMP);
    const rotateY = interpolate(scrollX.value, inputRange, [40, 0, -40], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [26, 0, 26], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [
        { perspective: 700 },
        { scale },
        { rotateY: `${rotateY}deg` },
        { translateY },
      ],
    };
  });

  return (
    <Animated.View style={[styles.coverflowItem, animatedStyle]}>{children}</Animated.View>
  );
}

function Tank({
  label,
  amount,
  capacity,
  color,
  tilt,
}: {
  label: string;
  amount: number;
  capacity: number;
  color: string;
  tilt: SharedValue<number>;
}) {
  const ratio = Math.max(0, Math.min(1, amount / capacity));
  const fillStyle = useAnimatedStyle(() => ({
    height: withTiming(`${ratio * 100}%`, { duration: 400 }),
    transform: [{ rotate: `${withSpring(tilt.value)}deg` }],
  }));

  return (
    <View style={styles.tankWrapper}>
      <ThemedView type="backgroundElement" style={styles.tankBody}>
        <Animated.View style={[styles.tankFill, { backgroundColor: color }, fillStyle]} />
      </ThemedView>
      <ThemedText type="smallBold" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {formatCurrency(amount)}
      </ThemedText>
    </View>
  );
}

function PendingExpenseCard({
  expense,
  tanks,
  onDropOnTank,
}: {
  expense: PendingExpense;
  tanks: IncomeTank[];
  onDropOnTank: (tank: IncomeTank) => void;
}) {
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const [tankIndex, setTankIndex] = useState(0);
  const hasTanks = tanks.length > 0;

  function selectTank(direction: 1 | -1) {
    if (!hasTanks) return;
    setTankIndex((current) => (current + direction + tanks.length) % tanks.length);
  }

  function confirmDrop() {
    if (!hasTanks) return;
    onDropOnTank(tanks[tankIndex]);
  }

  const pan = Gesture.Pan()
    .onChange((event) => {
      translateX.value += event.changeX;
    })
    .onEnd((event) => {
      const threshold = 80;
      if (event.translationX > threshold) {
        runOnJS(selectTank)(1);
      } else if (event.translationX < -threshold) {
        runOnJS(selectTank)(-1);
      } else if (Math.abs(event.translationX) < 10) {
        runOnJS(confirmDrop)();
      }
      translateX.value = withSpring(0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={cardStyle}>
        <ThemedView type="backgroundElement" style={styles.pendingCard}>
          <View style={styles.pendingCardMain}>
            <ThemedText type="smallBold">{expense.label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {expense.isVariableAmount
                ? 'Monto variable'
                : `Estimado ${formatCurrency(expense.estimatedAmount ?? 0)}`}
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {hasTanks ? `→ ${tanks[tankIndex].label}` : 'Sin tanques'}
          </ThemedText>
        </ThemedView>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  filterRow: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  filterScrollView: {
    flexGrow: 0,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  filterChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  carouselContainer: {
    position: 'relative',
    width: '100%',
    height: TANK_CAROUSEL_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
  },
  tankScrollView: {
    height: TANK_CAROUSEL_HEIGHT,
  },
  tankRow: {
    gap: TANK_GAP,
    paddingBottom: Spacing.two,
    alignItems: 'center',
  },
  coverflowItem: {
    alignItems: 'center',
  },
  edgeZone: {
    position: 'absolute',
    top: 0,
    height: TANK_HEIGHT,
    width: EDGE_ZONE_WIDTH,
  },
  edgeZoneLeft: {
    left: 0,
  },
  edgeZoneRight: {
    right: 0,
  },
  tankWrapper: {
    alignItems: 'center',
    gap: Spacing.one,
    width: TANK_ITEM_WIDTH,
  },
  tankBody: {
    width: TANK_WIDTH,
    height: TANK_HEIGHT,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignSelf: 'center',
  },
  tankFill: {
    width: '130%',
    alignSelf: 'center',
    borderTopLeftRadius: Spacing.two,
    borderTopRightRadius: Spacing.two,
  },
  pendingSection: {
    gap: Spacing.two,
  },
  pendingList: {
    gap: Spacing.two,
  },
  pendingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  pendingCardMain: {
    gap: Spacing.half,
  },
});
