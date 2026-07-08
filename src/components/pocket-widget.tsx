import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, Vibration, BackHandler, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { TANK_COLOR, FREE_TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';

const WAVE_PATH_BACK = 'M 0 100 C 25 90, 55 60, 85 25 T 100 0 L 100 100 Z';
const WAVE_PATH_FRONT = 'M 0 100 C 35 95, 65 65, 95 35 T 100 0 L 100 100 Z';

const WAVE_DOTS = [
  { left: 82, top: 76, size: 18, delay: 0, duration: 1600 },
  { left: 68, top: 86, size: 13, delay: 400, duration: 1850 },
  { left: 86, top: 56, size: 11, delay: 800, duration: 2000 },
];

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

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

export type PocketTank = {
  ruleId: number;
  label: string;
  color: string;
};

export type PocketExpense = {
  id: number;
  label: string;
  amount: number;
  occurredAt: Date;
  incomeRuleId: number;
};

type WidgetState = 'collapsed' | 'corner' | 'fullscreen';

const COLLAPSED_SIZE = 130;
const CORNER_SIZE = 250;

export function PocketWidget({
  tanks,
  expenses,
  onUnassign,
  vibrationEnabled = true,
  onCollapsedChange,
}: {
  tanks: PocketTank[];
  expenses: PocketExpense[];
  onUnassign: (expenseId: number) => void;
  vibrationEnabled?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [state, setState] = useState<WidgetState>('collapsed');
  const [selectedTankId, setSelectedTankId] = useState<number | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<PocketExpense | null>(null);

  const progress = useSharedValue(0);

  const expensesByTank = useMemo(() => {
    const map = new Map<number, PocketExpense[]>();
    for (const expense of expenses) {
      const list = map.get(expense.incomeRuleId) ?? [];
      list.push(expense);
      map.set(expense.incomeRuleId, list);
    }
    return map;
  }, [expenses]);

  const selectedTank = tanks.find((t) => t.ruleId === selectedTankId) ?? null;
  const selectedTankExpenses = selectedTankId !== null ? expensesByTank.get(selectedTankId) ?? [] : [];

  const updateState = useCallback(
    (newState: WidgetState) => {
      // Arranca la animación en el hilo de UI antes del setState: el re-render
      // del widget y de la pantalla padre no retrasa el primer frame.
      const target = newState === 'collapsed' ? 0 : newState === 'corner' ? 1 : 2;
      progress.value = withTiming(target, { duration: 420, easing: Easing.out(Easing.cubic) });
      setState(newState);
      onCollapsedChange?.(newState === 'collapsed');
    },
    [onCollapsedChange, progress],
  );

  useEffect(() => {
    if (state === 'collapsed') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedExpense !== null) {
        setSelectedExpense(null);
        return true;
      }
      if (selectedTankId !== null) {
        setSelectedTankId(null);
        return true;
      }
      if (state === 'fullscreen') {
        updateState('corner');
        return true;
      }
      if (state === 'corner') {
        updateState('collapsed');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [state, selectedTankId, selectedExpense, updateState]);

  function close() {
    updateState('collapsed');
    setSelectedTankId(null);
    setSelectedExpense(null);
  }

  function handleUnassign() {
    if (!selectedExpense) return;
    onUnassign(selectedExpense.id);
    setSelectedExpense(null);
  }

  const containerStyle = useAnimatedStyle(() => {
    const width = interpolate(progress.value, [0, 1, 2], [COLLAPSED_SIZE, CORNER_SIZE, screenWidth]);
    const height = interpolate(progress.value, [0, 1, 2], [COLLAPSED_SIZE, CORNER_SIZE, screenHeight]);
    const borderTopLeftRadius = interpolate(progress.value, [0, 1, 2], [0, 40, 0]);
    const shadowOpacity = interpolate(progress.value, [0, 1, 2], [0, 0.15, 0], 'clamp');
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1, 2],
      ['rgba(0, 145, 255, 0)', theme.backgroundElement, theme.background],
    );
    return {
      width,
      height,
      right: 0,
      bottom: 0,
      borderTopLeftRadius,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor,
      shadowOpacity,
    };
  });

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6, 1, 1.4], [0, 0, 1, 0], 'clamp'),
  }));

  const fieldStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [1.2, 1.8], [0, 1], 'clamp'),
  }));

  return (
    <>
      <Animated.View style={[styles.root, containerStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          pointerEvents={state === 'fullscreen' ? 'none' : 'auto'}
          onPress={() => {
            if (state === 'collapsed') {
              if (vibrationEnabled) Vibration.vibrate(30);
              updateState('corner');
            } else if (state === 'corner') {
              if (vibrationEnabled) Vibration.vibrate(30);
              updateState('fullscreen');
            }
          }}
        >
          <PeekWave progress={progress} />

          <Animated.View style={[styles.cornerCardContent, labelStyle]} pointerEvents="box-none">
            <ThemedText type="subtitle" style={styles.cornerCardTitle}>Bolsillo</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cornerCardSubtitle}>
              {tanks.length} {tanks.length === 1 ? 'tanque' : 'tanques'}
            </ThemedText>
            
            <View style={styles.cornerCardButton}>
              <ThemedText type="smallBold" style={styles.cornerCardButtonText}>Ver todo</ThemedText>
              <SymbolView name={symbol('chevron.right', 'chevron_right')} tintColor="#ffffff" size={14} />
            </View>
          </Animated.View>
        </Pressable>

        {state === 'corner' && (
          <Pressable onPress={close} style={styles.cornerCloseButton}>
            <SymbolView name={symbol('xmark', 'close')} tintColor={theme.textSecondary} size={14} />
          </Pressable>
        )}

        {state === 'fullscreen' && (
          <Animated.View
            style={[styles.fullscreenInner, fieldStyle, { backgroundColor: theme.background }]}
            pointerEvents={state === 'fullscreen' ? 'auto' : 'none'}
          >
            <View style={styles.fullscreenHeader}>
              {selectedTank ? (
                <Pressable onPress={() => setSelectedTankId(null)} style={styles.headerButton}>
                  <SymbolView name={symbol('chevron.left', 'arrow_back')} tintColor={theme.text} size={20} />
                  <ThemedText type="smallBold">Tanques</ThemedText>
                </Pressable>
              ) : (
                <ThemedText type="subtitle">Bolsillo</ThemedText>
              )}
              <Pressable onPress={close} style={styles.headerButton}>
                <SymbolView name={symbol('xmark', 'close')} tintColor={theme.text} size={20} />
              </Pressable>
            </View>

            {!selectedTank && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.fullscreenSubtitle}>
                Tocá un tanque para ver sus gastos.
              </ThemedText>
            )}
            {selectedTank && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.fullscreenSubtitle}>
                Gastos asignados a {selectedTank.label}.
              </ThemedText>
            )}

            <View style={styles.bubbleField} pointerEvents="box-none">
              {!selectedTank &&
                tanks.map((tank, index) => (
                  <FloatingBubble
                    key={tank.ruleId}
                    index={index}
                    total={tanks.length}
                    color={tank.color}
                    label={tank.label}
                    sublabel={`${expensesByTank.get(tank.ruleId)?.length ?? 0} gastos`}
                    onPress={() => setSelectedTankId(tank.ruleId)}
                  />
                ))}

              {selectedTank && selectedTankExpenses.length === 0 && (
                <View style={styles.emptyTankState}>
                  <ThemedText themeColor="textSecondary">Este tanque no tiene gastos asignados.</ThemedText>
                </View>
              )}
              {selectedTank &&
                selectedTankExpenses.map((expense, index) => (
                  <FloatingBubble
                    key={expense.id}
                    index={index}
                    total={selectedTankExpenses.length}
                    color={selectedTank.color}
                    label={expense.label}
                    sublabel={formatCompactCurrency(expense.amount)}
                    onPress={() => setSelectedExpense(expense)}
                  />
                ))}
            </View>
          </Animated.View>
        )}
      </Animated.View>

      <Modal visible={selectedExpense !== null} animationType="fade" transparent onRequestClose={() => setSelectedExpense(null)}>
        <Pressable style={styles.detailBackdrop} onPress={() => setSelectedExpense(null)}>
          <Pressable style={[styles.detailCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Detalle del gasto
            </ThemedText>
            <ThemedText style={styles.detailLabel}>{selectedExpense?.label}</ThemedText>
            <ThemedText style={[styles.detailAmount, { color: theme.text }]}>
              {selectedExpense ? formatCurrency(selectedExpense.amount) : ''}
            </ThemedText>
            {selectedExpense && (
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(selectedExpense.occurredAt).toLocaleDateString('es-AR')}
              </ThemedText>
            )}
            <Pressable onPress={handleUnassign} style={styles.unassignButton}>
              <SymbolView name={symbol('arrow.uturn.left', 'undo')} tintColor="#ffffff" size={16} />
              <ThemedText style={styles.unassignButtonText}>Sacar del tanque</ThemedText>
            </Pressable>
            <Pressable onPress={() => setSelectedExpense(null)} style={styles.detailClose}>
              <ThemedText type="small" themeColor="textSecondary">
                Cerrar
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PeekWave({ progress }: { progress: SharedValue<number> }) {
  const bobY = useSharedValue(0);
  const bobX = useSharedValue(0);
  const dot0 = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dotSharedValues = [dot0, dot1, dot2];

  useEffect(() => {
    bobY.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        withTiming(5, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    bobX.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(4, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    WAVE_DOTS.forEach((dot, i) => {
      dotSharedValues[i].value = withDelay(
        dot.delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: dot.duration, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: dot.duration, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La ola se escala con transform en vez de redimensionar el Svg: animar el
  // tamaño del Svg fuerza re-layout y re-rasterizado del vector en cada frame.
  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.8, 1.3], [1, 1, 0], 'clamp'),
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, CORNER_SIZE / COLLAPSED_SIZE], 'clamp') },
    ],
  }));

  const backWaveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bobX.value }, { translateY: bobY.value }],
  }));

  const frontWaveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -bobX.value }, { translateY: -bobY.value }],
  }));

  return (
    <Animated.View style={[styles.waveWrapper, wrapperStyle]} pointerEvents="none">
      {/* Capa de Onda Trasera (Back Wave) */}
      <Animated.View style={[StyleSheet.absoluteFill, backWaveStyle, { opacity: 0.4 }]}>
        <Svg width="120%" height="120%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ left: '-10%', top: '-10%' }}>
          <Path d={WAVE_PATH_BACK} fill={TANK_COLOR} />
        </Svg>
      </Animated.View>

      {/* Capa de Onda Delantera (Front Wave) con burbujas */}
      <Animated.View style={[StyleSheet.absoluteFill, frontWaveStyle, { opacity: 0.95 }]}>
        <Svg width="120%" height="120%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ left: '-10%', top: '-10%' }}>
          <Path d={WAVE_PATH_FRONT} fill={TANK_COLOR} />
        </Svg>
        {WAVE_DOTS.map((dot, i) => (
          <PeekDot key={i} dot={dot} progress={dotSharedValues[i]} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function PeekDot({
  dot,
  progress,
}: {
  dot: (typeof WAVE_DOTS)[number];
  progress: SharedValue<number>;
}) {
  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -8]) },
      { translateX: interpolate(progress.value, [0, 1], [0, 4]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.waveDot,
        dotStyle,
        {
          left: `${dot.left}%`,
          top: `${dot.top}%`,
          width: dot.size,
          height: dot.size,
          borderRadius: dot.size / 2,
          marginLeft: -dot.size / 2,
          marginTop: -dot.size / 2,
          backgroundColor: FREE_TANK_COLOR,
        },
      ]}
    />
  );
}

function FloatingBubble({
  index,
  total,
  color,
  label,
  sublabel,
  onPress,
}: {
  index: number;
  total: number;
  color: string;
  label: string;
  sublabel: string;
  onPress: () => void;
}) {
  const wanderX = useSharedValue(0);
  const wanderY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const [isFront, setIsFront] = useState(false);

  const startWander = () => {
    'worklet';
    const amp = 12 + Math.random() * 12;
    const dur = 2200 + Math.random() * 1800;
    wanderX.value = withRepeat(
      withSequence(
        withTiming(amp, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        withTiming(-amp, { duration: dur, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    wanderY.value = withRepeat(
      withSequence(
        withTiming(-amp * 0.7, { duration: dur * 1.2, easing: Easing.inOut(Easing.sin) }),
        withTiming(amp * 0.7, { duration: dur * 1.2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  };

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 160 });
    opacity.value = withTiming(1, { duration: 200 });
    startWander();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { left, top } = useMemo(() => layoutForIndex(index, total), [index, total]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });
      runOnJS(setIsFront)(true);
    })
    .onUpdate((event) => {
      dragX.value = event.translationX;
      dragY.value = event.translationY;
    })
    .onEnd(() => {
      dragX.value = withSpring(0, { damping: 16, stiffness: 140 });
      dragY.value = withSpring(0, { damping: 16, stiffness: 140 });
      startWander();
      runOnJS(setIsFront)(false);
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onPress)();
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: wanderX.value + dragX.value },
      { translateY: wanderY.value + dragY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.bubbleWrapper, { left: `${left}%`, top: `${top}%`, zIndex: isFront ? 20 : 1 }]}>
        <Animated.View style={[styles.bubble, animatedStyle, { backgroundColor: color, shadowColor: color }]}>
          <ThemedText type="smallBold" style={styles.bubbleLabel} numberOfLines={1}>
            {label}
          </ThemedText>
          <ThemedText style={styles.bubbleSublabel} numberOfLines={1}>
            {sublabel}
          </ThemedText>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function layoutForIndex(index: number, total: number): { left: number; top: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = 90 / cols;
  const cellH = 65 / rows;
  const jitterSeed = Math.sin(index * 12.9898) * 43758.5453;
  const jitter = jitterSeed - Math.floor(jitterSeed);
  return {
    left: 5 + col * cellW + cellW / 2 - 10 + jitter * 12,
    top: 20 + row * cellH + cellH / 2 - 8 + (1 - jitter) * 10,
  };
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 100,
    elevation: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  waveWrapper: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    transformOrigin: 'right bottom',
  },
  waveDot: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  cornerCardContent: {
    position: 'absolute',
    top: 40,
    left: 28,
    right: 48,
  },
  cornerCardTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  cornerCardSubtitle: {
    marginTop: 2,
    fontSize: 14,
  },
  cornerCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TANK_COLOR,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  cornerCardButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cornerCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    zIndex: 101,
  },
  fullscreenInner: {
    flex: 1,
    paddingTop: Spacing.six,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  fullscreenSubtitle: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: Spacing.one,
  },
  bubbleField: {
    flex: 1,
  },
  bubbleWrapper: {
    position: 'absolute',
    width: 96,
    height: 96,
    marginLeft: -48,
    marginTop: -48,
  },
  bubble: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bubbleLabel: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
  },
  bubbleSublabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  emptyTankState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  detailCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  detailAmount: {
    fontSize: 26,
    fontWeight: '800',
  },
  unassignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E5484D',
    borderRadius: 14,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  unassignButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  detailClose: {
    marginTop: Spacing.one,
    padding: Spacing.one,
  },
});
