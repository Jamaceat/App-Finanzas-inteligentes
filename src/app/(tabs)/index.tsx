/* eslint-disable react-hooks/immutability */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Children, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, Modal, type LayoutChangeEvent, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TankSearchModal, type SearchTankItem } from '@/components/tank-search-modal';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  EDGE_SCROLL_INTERVAL_MS,
  EDGE_SCROLL_STEP,
  EDGE_ZONE_WIDTH,
  FREE_TANK_COLOR,
  SEARCH_LONG_PRESS_DURATION_MS,
  SEARCH_PRESS_RELEASE_DURATION_MS,
  TANK_CAROUSEL_HEIGHT,
  TANK_COLOR,
  TANK_FILL_ANIMATION_DURATION_MS,
  TANK_GAP,
  TANK_HEIGHT,
  TANK_ITEM_WIDTH,
  TANK_LABEL_HEIGHT,
  TANK_SNAP_INTERVAL,
  TANK_WIDTH,
} from '@/constants/constants';
import { useDeviceTilt } from '@/hooks/use-device-tilt';
import { useTheme } from '@/hooks/use-theme';
import { listActiveRecurringRules } from '@/db/queries/recurring-rules';
import { listActiveSections } from '@/db/queries/sections';
import { watchAppSettingsRow } from '@/db/queries/settings';
import { listTransactions, allocateExpenseToIncomeTank } from '@/db/queries/transactions';
import {
  addInterval,
  computeFreeCashTank,
  computeIncomeTanks,
  computePendingExpenses,
  type IncomeTank,
  type PendingExpense,
} from '@/db/queries/tanks';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
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

export default function HomeScreen() {
  const { data: rules } = useLiveQuery(listActiveRecurringRules());
  const { data: transactions } = useLiveQuery(listTransactions());
  const { data: sections } = useLiveQuery(listActiveSections());
  const { data: settingsRows } = useLiveQuery(watchAppSettingsRow());
  const settings = settingsRows[0] ?? { tankMaxRenewalValue: 30, tankMaxRenewalUnit: 'days' as const };
  const tilt = useDeviceTilt();
  const theme = useTheme();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPressing, setIsPressing] = useState(false);
  const pressProgress = useSharedValue(0);

  // States for selected expense detail modal
  const [focusedExpense, setFocusedExpense] = useState<PendingExpense | null>(null);
  const [expenseTankIndices, setExpenseTankIndices] = useState<Record<number, number>>({});

  // Reanimated values for focused modal animations
  const backdropOpacity = useSharedValue(0);
  const modalScale = useSharedValue(0.8);
  const modalTranslateY = useSharedValue(50);

  useEffect(() => {
    if (focusedExpense) {
      backdropOpacity.value = withTiming(1, { duration: 250 });
      modalScale.value = withSpring(1, { damping: 15, stiffness: 120 });
      modalTranslateY.value = withSpring(0, { damping: 15, stiffness: 120 });
    }
  }, [focusedExpense, backdropOpacity, modalScale, modalTranslateY]);

  const closeModal = () => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    modalScale.value = withTiming(0.8, { duration: 200 });
    modalTranslateY.value = withTiming(50, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setFocusedExpense)(null);
      }
    });
  };

  const handlePressIn = () => {
    setIsPressing(true);
    pressProgress.value = 0;
    pressProgress.value = withTiming(1, { duration: SEARCH_LONG_PRESS_DURATION_MS }, (finished) => {
      if (finished) {
        runOnJS(openSearchModal)();
      }
    });
  };

  const handlePressOut = () => {
    setIsPressing(false);
    if (pressProgress.value < 1) {
      pressProgress.value = withTiming(0, { duration: SEARCH_PRESS_RELEASE_DURATION_MS });
    }
  };

  const openSearchModal = () => {
    setIsPressing(false);
    pressProgress.value = 0;
    setModalVisible(true);
  };

  const incomeTanks = useMemo(() => computeIncomeTanks(rules, transactions), [rules, transactions]);
  const freeCashTank = useMemo(() => {
    const windowStart = addInterval(
      new Date(),
      -settings.tankMaxRenewalValue,
      settings.tankMaxRenewalUnit,
    );
    return computeFreeCashTank(rules, transactions, windowStart);
  }, [rules, transactions, settings.tankMaxRenewalValue, settings.tankMaxRenewalUnit]);
  const pendingExpenses = useMemo(() => computePendingExpenses(rules), [rules]);

  const allTanks = useMemo(() => {
    const list: SearchTankItem[] = [
      {
        ruleId: undefined,
        label: 'Libre',
        amount: freeCashTank.level,
        capacity: Math.max(freeCashTank.capacity, 1),
        color: FREE_TANK_COLOR,
      },
    ];
    incomeTanks.forEach((tank) => {
      list.push({
        ruleId: tank.ruleId,
        label: tank.label,
        amount: tank.level,
        capacity: Math.max(tank.capacity, 1),
        color: TANK_COLOR,
      });
    });
    return list;
  }, [freeCashTank, incomeTanks]);

  const handleSelectTank = (selected: SearchTankItem) => {
    setModalVisible(false);
    setSearchQuery('');
    setSelectedSectionId(null);

    let targetIndex = 0;
    if (selected.ruleId !== undefined) {
      const idx = incomeTanks.findIndex((t) => t.ruleId === selected.ruleId);
      if (idx !== -1) {
        targetIndex = idx + 1;
      }
    }

    setTimeout(() => {
      runOnUI(() => {
        scrollTo(scrollRef, targetIndex * TANK_SNAP_INTERVAL, 0, true);
      })();
    }, 100);
  };

  const outerRingStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: interpolate(pressProgress.value, [0, 1], [0.8, 2.0]) },
      ],
      opacity: interpolate(pressProgress.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
      borderColor: TANK_COLOR,
    };
  });

  const innerCircleStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: pressProgress.value },
      ],
      opacity: interpolate(pressProgress.value, [0, 1], [0, 0.4]),
      backgroundColor: TANK_COLOR,
    };
  });

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
    <GestureHandlerRootView style={styles.gestureRoot}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
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

            <View style={styles.searchButtonContainerCentered}>
              {isPressing && (
                <>
                  <Animated.View style={[styles.pressOuterRing, outerRingStyle]} />
                  <Animated.View style={[styles.pressInnerCircle, innerCircleStyle]} />
                </>
              )}
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={[
                  styles.searchButton,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <SymbolView
                  name={symbol('magnifyingglass', 'search')}
                  tintColor={theme.text}
                  size={22}
                />
              </Pressable>
            </View>

            <TankCarousel scrollRef={scrollRef}>
              <Tank
                label="Libre"
                amount={freeCashTank.level}
                capacity={Math.max(freeCashTank.capacity, 1)}
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
                {pendingExpenses.map((expense) => {
                  const currentTankIndex = expenseTankIndices[expense.ruleId] ?? 0;
                  const section = (sections || []).find((s) => s.id === expense.sectionId);
                  return (
                    <PendingExpenseCard
                      key={expense.ruleId}
                      expense={expense}
                      tanks={incomeTanks}
                      section={section}
                      tankIndex={currentTankIndex}
                      onSelectTankIndex={(newIdx) => {
                        setExpenseTankIndices((prev) => ({ ...prev, [expense.ruleId]: newIdx }));
                      }}
                      onPress={() => {
                        setFocusedExpense(expense);
                      }}
                      onDropOnTank={(tank) => confirmAllocate(expense, tank)}
                    />
                  );
                })}
              </View>
            </View>
          </ScrollView>
          <TankSearchModal
            visible={modalVisible}
            onClose={() => {
              setModalVisible(false);
              setSearchQuery('');
            }}
            tanks={allTanks}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSelectTank={handleSelectTank}
          />
        </SafeAreaView>

        {/* Focused Expense Detail Modal */}
        {focusedExpense && (() => {
        const hasTanks = incomeTanks.length > 0;
        const currentTankIndex = expenseTankIndices[focusedExpense.ruleId] ?? 0;
        const focusedSection = (sections || []).find((s) => s.id === focusedExpense.sectionId);
        
        return (
          <Modal
            transparent
            visible={focusedExpense !== null}
            onRequestClose={closeModal}
            statusBarTranslucent
            animationType="none"
          >
            <View style={styles.modalOverlayContainer}>
              <Animated.View 
                style={[
                  styles.modalBackdrop, 
                  { 
                    opacity: backdropOpacity,
                    backgroundColor: theme.background === '#000000' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.65)'
                  }
                ]}
              >
                <Pressable style={styles.backdropPressable} onPress={closeModal} />
              </Animated.View>

              <Animated.View 
                style={[
                  styles.focusedCardContainer, 
                  { 
                    backgroundColor: theme.backgroundElement,
                    transform: [{ scale: modalScale }, { translateY: modalTranslateY }] 
                  }
                ]}
              >
                <View style={styles.focusedHeader}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Asignar Gasto Pendiente
                  </ThemedText>
                  {focusedSection && (
                    <View style={[styles.focusedSectionBadge, { backgroundColor: focusedSection.color + '1F' }]}>
                      <SymbolView 
                        name={symbol(focusedSection.icon as SFSymbol, focusedSection.icon as AndroidSymbol)}
                        tintColor={focusedSection.color}
                        size={12}
                      />
                      <ThemedText type="code" style={{ color: focusedSection.color, marginLeft: 4 }}>
                        {focusedSection.name}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.focusedExpenseDetail}>
                  <ThemedText type="subtitle" style={styles.focusedExpenseLabel} numberOfLines={2}>
                    {focusedExpense.label}
                  </ThemedText>
                  <ThemedText style={[styles.focusedExpenseAmount, { color: theme.text }]}>
                    {focusedExpense.isVariableAmount
                      ? 'Monto variable'
                      : formatCurrency(focusedExpense.estimatedAmount ?? 0)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.focusedExpenseMeta}>
                    {`Frecuencia: ${focusedExpense.frequency} • Vence: ${new Date(focusedExpense.nextDueDate).toLocaleDateString('es-AR')}`}
                  </ThemedText>
                </View>

                <View style={styles.focusedTargetContainer}>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 6 }}>
                    Se debitará del tanque:
                  </ThemedText>
                  <View style={[
                    styles.focusedTargetTankBadge, 
                    { 
                      backgroundColor: theme.backgroundSelected,
                      borderColor: theme.backgroundSelected,
                      borderWidth: 1,
                    }
                  ]}>
                    <View style={[
                      styles.tankBullet, 
                      { backgroundColor: hasTanks ? TANK_COLOR : '#E5484D' }
                    ]} />
                    <ThemedText type="smallBold" style={{ flex: 1 }}>
                      {hasTanks ? incomeTanks[currentTankIndex].label : 'Sin tanques'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {hasTanks ? `Saldo: ${formatCurrency(incomeTanks[currentTankIndex].level)}` : ''}
                    </ThemedText>
                  </View>
                </View>

                {hasTanks && (
                  <View style={styles.focusedTankSelectorContainer}>
                    <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginBottom: 8 }}>
                      Cambiar de tanque origen:
                    </ThemedText>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.focusedTankList}
                    >
                      {incomeTanks.map((tank, index) => {
                        const isSelected = index === currentTankIndex;
                        return (
                          <Pressable
                            key={tank.ruleId}
                            onPress={() => {
                              setExpenseTankIndices(prev => ({ ...prev, [focusedExpense.ruleId]: index }));
                            }}
                            style={[
                              styles.focusedTankChip,
                              { 
                                backgroundColor: isSelected ? TANK_COLOR : theme.backgroundSelected,
                                borderColor: isSelected ? TANK_COLOR : theme.backgroundSelected,
                              }
                            ]}
                          >
                            <View style={[styles.tankBullet, { backgroundColor: isSelected ? '#ffffff' : TANK_COLOR }]} />
                            <ThemedText 
                              type="small" 
                              style={{ 
                                color: isSelected ? '#ffffff' : theme.text,
                                fontWeight: isSelected ? '700' : '500'
                              }}
                            >
                              {tank.label}
                            </ThemedText>
                            <ThemedText 
                              type="code" 
                              style={{ 
                                color: isSelected ? 'rgba(255,255,255,0.8)' : theme.textSecondary,
                                fontSize: 11,
                                marginLeft: 6
                              }}
                            >
                              {formatCompactCurrency(tank.level)}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.focusedActions}>
                  <Pressable
                    onPress={closeModal}
                    style={[styles.btnSecondary, { backgroundColor: theme.backgroundSelected }]}
                  >
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      Cancelar
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      if (hasTanks) {
                        const targetTank = incomeTanks[currentTankIndex];
                        closeModal();
                        await handleAllocate(focusedExpense, targetTank);
                      }
                    }}
                    style={[
                      styles.btnPrimary, 
                      { backgroundColor: hasTanks ? TANK_COLOR : theme.backgroundSelected }
                    ]}
                    disabled={!hasTanks}
                  >
                    <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
                      Confirmar Pago
                    </ThemedText>
                  </Pressable>
                </View>
              </Animated.View>
            </View>
          </Modal>
        );
      })()}
      </ThemedView>
    </GestureHandlerRootView>
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

function TankCarousel({
  children,
  scrollRef,
}: {
  children: React.ReactNode;
  scrollRef: any;
}) {
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

function interpolateCustom(value: number, input: number[], output: number[]): number {
  'worklet';
  const len = input.length;
  if (len === 0) return 0;
  if (value <= input[0]) return output[0];
  if (value >= input[len - 1]) return output[len - 1];
  
  for (let i = 0; i < len - 1; i++) {
    const x0 = input[i];
    const x1 = input[i + 1];
    if (value >= x0 && value <= x1) {
      const y0 = output[i];
      const y1 = output[i + 1];
      if (x1 === x0) return y0;
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return output[0];
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
      (index - 3) * TANK_SNAP_INTERVAL,
      (index - 2) * TANK_SNAP_INTERVAL,
      (index - 1) * TANK_SNAP_INTERVAL,
      index * TANK_SNAP_INTERVAL,
      (index + 1) * TANK_SNAP_INTERVAL,
      (index + 2) * TANK_SNAP_INTERVAL,
      (index + 3) * TANK_SNAP_INTERVAL,
    ];
    
    const scale = interpolateCustom(
      scrollX.value,
      inputRange,
      [1.3, 1.15, 1.0, 0.85, 1.0, 1.15, 1.3]
    );
    const rotateY = interpolateCustom(
      scrollX.value,
      inputRange,
      [-84, -56, -28, 0, 28, 56, 84]
    );
    const translateY = 0;
    const opacity = interpolateCustom(
      scrollX.value,
      inputRange,
      [0.0, 0.4, 0.9, 1.0, 0.9, 0.4, 0.0]
    );

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
  const animatedTilt = useDerivedValue(() => {
    return withSpring(tilt.value);
  });
  const fillStyle = useAnimatedStyle(() => ({
    height: withTiming(`${ratio * 100}%`, { duration: TANK_FILL_ANIMATION_DURATION_MS }),
    transform: [{ rotate: `${animatedTilt.value}deg` }],
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
  section,
  tankIndex,
  onSelectTankIndex,
  onPress,
  onDropOnTank,
}: {
  expense: PendingExpense;
  tanks: IncomeTank[];
  section?: { name: string; color: string; icon: string };
  tankIndex: number;
  onSelectTankIndex: (index: number) => void;
  onPress: () => void;
  onDropOnTank: (tank: IncomeTank) => void;
}) {
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const hasTanks = tanks.length > 0;

  function selectTank(direction: 1 | -1) {
    if (!hasTanks) return;
    const nextIdx = (tankIndex + direction + tanks.length) % tanks.length;
    onSelectTankIndex(nextIdx);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
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
        runOnJS(onPress)();
      }
      translateX.value = withSpring(0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: cardScale.value }
    ],
  }));

  const sectionColor = section?.color || TANK_COLOR;
  const sectionIconName = section?.icon || 'tag.fill';

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={cardStyle}>
        <Pressable
          onPressIn={() => {
            cardScale.value = withTiming(0.97, { duration: 100 });
          }}
          onPressOut={() => {
            cardScale.value = withTiming(1, { duration: 100 });
          }}
          onPress={onPress}
        >
          <ThemedView type="backgroundElement" style={styles.pendingCard}>
            {/* Left: Section Icon Badge */}
            <View style={[styles.cardIconContainer, { backgroundColor: sectionColor + '1C' }]}>
              <SymbolView
                name={symbol(sectionIconName as SFSymbol, sectionIconName as AndroidSymbol)}
                tintColor={sectionColor}
                size={18}
              />
            </View>

            {/* Middle: Title & Date (Full width flex) */}
            <View style={styles.pendingCardMain}>
              <ThemedText style={styles.cardLabelText} numberOfLines={2}>
                {expense.label}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardSubText}>
                {expense.frequency === 'custom'
                  ? `${expense.customIntervalValue} ${expense.customIntervalUnit === 'weeks' ? 'sem' : 'días'}`
                  : expense.frequency}
              </ThemedText>
            </View>

            {/* Right: Value & Assigned Tank */}
            <View style={styles.cardRightColumn}>
              <ThemedText style={[styles.cardValueText, { color: theme.text }]}>
                {expense.isVariableAmount
                  ? 'Var.'
                  : formatCompactCurrency(expense.estimatedAmount ?? 0)}
              </ThemedText>
              
              <View style={[
                styles.cardTankPill, 
                { backgroundColor: hasTanks ? TANK_COLOR + '14' : '#E5484D14' }
              ]}>
                <View style={[
                  styles.tankBulletMini, 
                  { backgroundColor: hasTanks ? TANK_COLOR : '#E5484D' }
                ]} />
                <ThemedText 
                  type="code" 
                  numberOfLines={1} 
                  style={{ 
                    color: hasTanks ? TANK_COLOR : '#E5484D',
                    fontSize: 10,
                    fontWeight: '700',
                    maxWidth: 70
                  }}
                >
                  {hasTanks ? tanks[tankIndex].label : 'Sin tanques'}
                </ThemedText>
              </View>
            </View>
          </ThemedView>
        </Pressable>
      </Animated.View>
    </GestureDetector>
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
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    paddingHorizontal: Spacing.four,
  },
  searchButtonContainerCentered: {
    alignSelf: 'center',
    position: 'relative',
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: Spacing.half,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressOuterRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  pressInnerCircle: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  filterRow: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
    paddingHorizontal: Spacing.four,
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
    paddingHorizontal: Spacing.four,
  },
  pendingList: {
    gap: Spacing.two,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.1)',
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  pendingCardMain: {
    flex: 1,
    justifyContent: 'center',
  },
  cardLabelText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  cardSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  cardRightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: Spacing.two,
    gap: 4,
  },
  cardValueText: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardTankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  tankBulletMini: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modalOverlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  backdropPressable: {
    flex: 1,
  },
  focusedCardContainer: {
    width: '90%',
    maxWidth: 380,
    borderRadius: 24,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    gap: Spacing.three,
  },
  focusedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  focusedSectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  focusedExpenseDetail: {
    alignItems: 'center',
    marginVertical: Spacing.two,
  },
  focusedExpenseLabel: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: Spacing.two,
  },
  focusedExpenseAmount: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  focusedExpenseMeta: {
    fontSize: 12,
    textAlign: 'center',
  },
  focusedTargetContainer: {
    width: '100%',
  },
  focusedTargetTankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
  },
  tankBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  focusedTankSelectorContainer: {
    width: '100%',
  },
  focusedTankList: {
    gap: Spacing.two,
    paddingVertical: 4,
  },
  focusedTankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  focusedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  btnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: TANK_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  btnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
