/* eslint-disable react-hooks/immutability */
import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, useWindowDimensions, Vibration } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  SharedValue,
  interpolate,
  withDelay,
} from 'react-native-reanimated';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  TANK_COLOR,
  EXPENSE_POINT_ENTRANCE_BASE_DELAY_MS,
  EXPENSE_POINT_ENTRANCE_STAGGER_MS,
  EXPENSE_POINT_ENTRANCE_DURATION_MS,
  URGENCY_OVERDUE_COLOR,
  URGENCY_DUE_SOON_COLOR,
} from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import type { Urgency } from '@/lib/bubble-visuals';
import { formatCurrency } from '@/lib/format';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

export type MiniTankTarget = {
  ruleId: number;
  label: string;
  color: string;
  level: number;
  capacity: number;
};

export const POINT_WIDTH = 160;
export const POINT_HEIGHT = 52;
const TANK_SIZE = 80;

function FloatingExpensePointComponent({
  pointKey,
  label,
  amountLabel,
  fullAmountLabel,
  sectionColor,
  sectionIcon,
  isVariable,
  rawAmount,
  frequency,
  nextDueDate,
  color,
  tanks,
  originX,
  originY,
  initialX,
  initialY,
  focusedPointKey,
  onSetFocused,
  onAssign,
  vibrationEnabled,
  onPositionChange,
  zIndex,
  onInteractionStart,
  sizeScale = 1,
  urgency = 'neutral',
  forceDimmed = false,
  allowPartialAssignment,
}: {
  pointKey: string;
  label: string;
  amountLabel: string;
  fullAmountLabel: string;
  sectionColor?: string;
  sectionIcon?: string;
  isVariable: boolean;
  rawAmount: number;
  frequency?: string;
  nextDueDate?: Date;
  color: string;
  tanks: MiniTankTarget[];
  originX: number;
  originY: number;
  initialX: number;
  initialY: number;
  focusedPointKey: string | null;
  onSetFocused: (key: string | null) => void;
  onAssign: (ruleId: number, allocatedAmount: number) => void;
  vibrationEnabled: boolean;
  onPositionChange: (key: string, x: number, y: number) => void;
  zIndex: number;
  onInteractionStart: (key: string) => void;
  sizeScale?: number;
  urgency?: Urgency;
  forceDimmed?: boolean;
  allowPartialAssignment: boolean;
}) {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const centerX = screenWidth / 2;
  const centerY = screenHeight / 2;

  const isFocused = focusedPointKey === pointKey;
  const anyFocused = focusedPointKey !== null;
  // Un gasto "suelto" (sección con un solo ítem) puede quedar en la raíz del
  // árbol de clusters junto a otros clusters: forceDimmed lo atenúa cuando un
  // cluster hermano está expandido, igual que si estuviera enfocado otro punto.
  const isDimmed = (anyFocused && !isFocused) || forceDimmed;

  const [assigningTankId, setAssigningTankId] = useState<number | null>(null);

  const translateX = useSharedValue(screenWidth - 65 - initialX);
  const translateY = useSharedValue(screenHeight - 65 - initialY);
  const wanderX = useSharedValue(0);
  const wanderY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isFreeDragging = useSharedValue(false);
  const hoveredTankId = useSharedValue<number | null>(null);
  const pillScale = useSharedValue(0);
  const detailsVisible = useSharedValue(0);

  // Sync detailsVisible with isFocused state
  useEffect(() => {
    if (isFocused) {
      detailsVisible.value = withTiming(1, { duration: 250 });
    } else {
      detailsVisible.value = withTiming(0, { duration: 200 });
    }
  }, [isFocused]);

  const isMountedRef = useRef(false);

  // Sync positions when props change from non-drag sources (e.g. screen resize or filter change)
  useEffect(() => {
    if (isMountedRef.current) {
      if (!isDragging.value && !isFreeDragging.value) {
        translateX.value = originX - initialX;
        translateY.value = originY - initialY;
      }
    } else {
      isMountedRef.current = true;
      // Stagger fly-out delay so bubbles pop out sequentially after modal/screen load finishes
      const charCode = label.charCodeAt(0) || 0;
      const stagger = (charCode % 4) * EXPENSE_POINT_ENTRANCE_STAGGER_MS;
      const delay = EXPENSE_POINT_ENTRANCE_BASE_DELAY_MS + stagger;

      const entranceTiming = {
        duration: EXPENSE_POINT_ENTRANCE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      };
      pillScale.value = withDelay(delay, withTiming(sizeScale, entranceTiming));
      translateX.value = withDelay(delay, withTiming(originX - initialX, entranceTiming));
      translateY.value = withDelay(delay, withTiming(originY - initialY, entranceTiming));
    }
  }, [originX, originY, initialX, initialY, translateX, translateY, isDragging, isFreeDragging, pillScale, label, sizeScale]);

  const startWander = () => {
    'worklet';
    const amp = 14 + Math.random() * 10;
    const dur = 2400 + Math.random() * 1600;
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

  // El vaivén se detiene tanto si el punto está enfocado como si está atenuado
  // (otro punto enfocado, o un cluster hermano expandido): los puntos que no
  // se ven interactuar no necesitan gastar frames animando.
  useEffect(() => {
    if (isFocused || isDimmed) {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });
    } else if (!isDragging.value && !isFreeDragging.value) {
      runOnUI(startWander)();
    }
  }, [isFocused, isDimmed, wanderX, wanderY]);

  const skipFocusMountRef = useRef(true);
  // Handle pill scale spring on focus (accelerated)
  useEffect(() => {
    if (skipFocusMountRef.current) {
      skipFocusMountRef.current = false;
      return;
    }
    if (assigningTankId === null) {
      pillScale.value = withSpring(isFocused ? 1.15 : sizeScale, { damping: 15, stiffness: 180 });
    }
  }, [isFocused, assigningTankId, pillScale, sizeScale]);

  const skipCenterFlightMountRef = useRef(true);
  // Center flight trigger (accelerated)
  useEffect(() => {
    if (skipCenterFlightMountRef.current) {
      skipCenterFlightMountRef.current = false;
      return;
    }
    if (assigningTankId !== null) return;
    if (isFocused) {
      if (!isDragging.value) {
        translateX.value = withSpring(centerX - initialX, { damping: 18, stiffness: 180 });
        translateY.value = withSpring(centerY - initialY, { damping: 18, stiffness: 180 });
      }
    } else {
      translateX.value = withSpring(originX - initialX, { damping: 18, stiffness: 180 });
      translateY.value = withSpring(originY - initialY, { damping: 18, stiffness: 180 });
    }
  }, [isFocused, originX, originY, initialX, initialY, centerX, centerY, translateX, translateY, isDragging, assigningTankId]);

  function triggerHoverVibration() {
    if (vibrationEnabled) {
      Vibration.vibrate(30);
    }
  }

  function triggerRejectVibration() {
    if (vibrationEnabled) {
      Vibration.vibrate([0, 40, 40, 40]);
    }
  }

  function springBackToCenter() {
    translateX.value = withSpring(centerX - initialX, { damping: 18, stiffness: 180 });
    translateY.value = withSpring(centerY - initialY, { damping: 18, stiffness: 180 });
    detailsVisible.value = withTiming(1, { duration: 250 });
  }

  // Decide si el gasto entra completo, parcial (si el disponible no alcanza y
  // la config lo permite) o se rechaza, y dispara la animación correspondiente.
  // Usado tanto por el tap directo en un mini-tanque como (via runOnJS) por el
  // gesto de arrastre, para que ambos caminos apliquen la misma regla.
  function attemptAssign(target: number) {
    if (assigningTankId !== null) return;

    const tank = tanks.find((t) => t.ruleId === target);
    const tankLevel = tank?.level ?? 0;
    const fitsFully = isVariable || rawAmount <= tankLevel;
    const fitsPartially = !fitsFully && allowPartialAssignment && tankLevel > 0;

    if (fitsFully) {
      handleAssign(target, rawAmount);
    } else if (fitsPartially) {
      handleAssign(target, tankLevel);
    } else {
      triggerRejectVibration();
      springBackToCenter();
    }
  }

  function handleAssign(target: number, allocatedAmount: number) {
    if (assigningTankId !== null) return;

    if (vibrationEnabled) {
      Vibration.vibrate(100);
    }

    setAssigningTankId(target);

    const index = tanks.findIndex((t) => t.ruleId === target);
    if (index !== -1) {
      const angle = (index / tanks.length) * Math.PI * 2 - Math.PI / 2;
      const currentDetailsVisible = detailsVisible.value;
      const baseRadius = 110;
      const expandedRadius = 150;
      const radius = baseRadius + (expandedRadius - baseRadius) * currentDetailsVisible;
      
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      let xOffset = 0;
      let yOffset = 0;
      if (sinA > 0.1) {
        xOffset = (cosA > 0 ? 35 : -35) * currentDetailsVisible;
        yOffset = -20 * currentDetailsVisible;
      }
      
      const targetCX = centerX + cosA * radius + xOffset;
      const targetCY = centerY + sinA * radius + yOffset;

      translateX.value = withSpring(targetCX - initialX, { damping: 20, stiffness: 90 });
      translateY.value = withSpring(targetCY - initialY, { damping: 20, stiffness: 90 });
    }
    pillScale.value = withSpring(0, { damping: 18, stiffness: 100 });

    setTimeout(() => {
      onAssign(target, allocatedAmount);
      onSetFocused(null);
    }, 320);
  }

  const tap = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onInteractionStart)(pointKey);
      runOnJS(onSetFocused)(isFocused ? null : pointKey);
    });

  const pan = Gesture.Pan()
    .onBegin((event) => {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });

      if (isFocused) {
        isDragging.value = true;
        detailsVisible.value = withTiming(0, { duration: 150 });
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(screenWidth - POINT_WIDTH / 2, event.absoluteX));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(screenHeight - POINT_HEIGHT / 2, event.absoluteY));
        translateX.value = withSpring(clampedX - initialX, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(clampedY - initialY, { damping: 20, stiffness: 200 });
      } else {
        isFreeDragging.value = true;
        runOnJS(onInteractionStart)(pointKey);
      }
    })
    .onUpdate((event) => {
      if (isFocused) {
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(screenWidth - POINT_WIDTH / 2, event.absoluteX));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(screenHeight - POINT_HEIGHT / 2, event.absoluteY));

        // Magnetic field: the pill position blends continuously between the
        // finger and the nearest tank center, so attraction ramps up smoothly
        // on approach and eases off (with resistance) when pulling away.
        const ATTRACT_RADIUS = 120; // pull starts being felt
        const CAPTURE_RADIUS = 60; // close enough to count as hovered/droppable
        const RELEASE_RADIUS = 90; // must move this far to break the hover (hysteresis)

        let nearestId: number | null = null;
        let nearestDist = Infinity;
        let nearestCX = 0;
        let nearestCY = 0;
        let hoveredDist = Infinity;

        tanks.forEach((tank, index) => {
          const angle = (index / tanks.length) * Math.PI * 2 - Math.PI / 2;
          // During dragging, the circles are contracted (detailsVisible.value is 0)
          const tankCX = centerX + Math.cos(angle) * 110;
          const tankCY = centerY + Math.sin(angle) * 110;

          const dx = event.absoluteX - tankCX;
          const dy = event.absoluteY - tankCY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < nearestDist) {
            nearestDist = dist;
            nearestId = tank.ruleId;
            nearestCX = tankCX;
            nearestCY = tankCY;
          }
          if (tank.ruleId === hoveredTankId.value) {
            hoveredDist = dist;
          }
        });

        let targetX = clampedX;
        let targetY = clampedY;
        if (nearestId !== null && nearestDist < ATTRACT_RADIUS) {
          const t = 1 - nearestDist / ATTRACT_RADIUS;
          const pull = t * t * (3 - 2 * t); // smoothstep: gentle at the edge, firm at the center
          targetX = clampedX + (nearestCX - clampedX) * pull;
          targetY = clampedY + (nearestCY - clampedY) * pull;
        }
        translateX.value = targetX - initialX;
        translateY.value = targetY - initialY;

        let nextHovered = hoveredTankId.value;
        if (nearestId !== null && nearestDist < CAPTURE_RADIUS) {
          nextHovered = nearestId;
        } else if (nextHovered !== null && hoveredDist > RELEASE_RADIUS) {
          nextHovered = null;
        }

        if (nextHovered !== hoveredTankId.value) {
          hoveredTankId.value = nextHovered;
          if (nextHovered !== null) {
            runOnJS(triggerHoverVibration)();
          }
        }
      } else {
        const targetX = event.translationX + originX;
        const targetY = event.translationY + originY;
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(screenWidth - POINT_WIDTH / 2, targetX));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(screenHeight - POINT_HEIGHT / 2, targetY));
        translateX.value = clampedX - initialX;
        translateY.value = clampedY - initialY;
      }
    })
    .onEnd((event) => {
      isDragging.value = false;
      
      if (isFocused) {
        const target = hoveredTankId.value;

        if (target !== null) {
          let tankLevel = 0;
          for (let i = 0; i < tanks.length; i++) {
            if (tanks[i].ruleId === target) {
              tankLevel = tanks[i].level;
              break;
            }
          }
          const fitsFully = isVariable || rawAmount <= tankLevel;
          const fitsPartially = !fitsFully && allowPartialAssignment && tankLevel > 0;

          if (fitsFully) {
            runOnJS(handleAssign)(target, rawAmount);
          } else if (fitsPartially) {
            runOnJS(handleAssign)(target, tankLevel);
          } else {
            runOnJS(triggerRejectVibration)();
            translateX.value = withSpring(centerX - initialX, { damping: 18, stiffness: 180 });
            translateY.value = withSpring(centerY - initialY, { damping: 18, stiffness: 180 });
            detailsVisible.value = withTiming(1, { duration: 250 });
          }
        } else {
          translateX.value = withSpring(centerX - initialX, { damping: 18, stiffness: 180 });
          translateY.value = withSpring(centerY - initialY, { damping: 18, stiffness: 180 });
          detailsVisible.value = withTiming(1, { duration: 250 });
        }
        hoveredTankId.value = null;
      } else if (isFreeDragging.value) {
        isFreeDragging.value = false;
        const targetX = originX + event.translationX;
        const targetY = originY + event.translationY;
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(screenWidth - POINT_WIDTH / 2, targetX));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(screenHeight - POINT_HEIGHT / 2, targetY));
        runOnJS(onPositionChange)(pointKey, clampedX, clampedY);
        startWander();
      }
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const pointStyle = useAnimatedStyle(() => {
    const tx = translateX.value + wanderX.value;
    const ty = translateY.value + wanderY.value;

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: pillScale.value },
      ],
    };
  });

  // Aparte del transform: aquel worklet corre en cada frame del wander/drag, y
  // la opacidad solo cambia con assigningTankId/isDimmed.
  const pointOpacityStyle = useAnimatedStyle(() => {
    let targetOpacity = 1;
    if (assigningTankId !== null) {
      targetOpacity = 0;
    } else if (isDimmed) {
      targetOpacity = 0.12;
    }
    return { opacity: withTiming(targetOpacity, { duration: 250 }) };
  }, [assigningTankId, isDimmed]);

  const detailsStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(detailsVisible.value, { duration: 180 }),
      transform: [
        { scale: withSpring(interpolate(detailsVisible.value, [0, 1], [0.8, 1])) },
      ],
    };
  });

  const sectionIconName = sectionIcon || 'tag.fill';
  const displayColor = sectionColor || color;
  const urgencyColor =
    urgency === 'overdue' ? URGENCY_OVERDUE_COLOR : urgency === 'dueSoon' ? URGENCY_DUE_SOON_COLOR : null;

  return (
    <View
      style={[
        styles.wrapper, 
        { 
          left: initialX - POINT_WIDTH / 2,
          top: initialY - POINT_HEIGHT / 2,
          zIndex: isFocused ? 1000 : zIndex,
        }
      ]}
      pointerEvents={isDimmed ? "none" : "box-none"}
    >
      {/* Radial tanks targets centered around the screen center */}
      {isFocused && (
        <View style={styles.radialContainer} pointerEvents="box-none">
          {tanks.map((tank, index) => {
            const angle = (index / tanks.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <MiniTankTargetView
                key={tank.ruleId}
                tank={tank}
                angle={angle}
                centerX={centerX}
                centerY={centerY}
                initialX={initialX}
                initialY={initialY}
                detailsVisible={detailsVisible}
                assigningTankId={assigningTankId}
                hoveredTankId={hoveredTankId}
                rawAmount={rawAmount}
                isVariable={isVariable}
                allowPartialAssignment={allowPartialAssignment}
                onPress={() => {
                  attemptAssign(tank.ruleId);
                }}
              />
            );
          })}
        </View>
      )}

      {/* The main pill/bubble */}
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.point,
            {
              backgroundColor: displayColor,
              shadowColor: displayColor,
            },
            urgencyColor ? { borderColor: urgencyColor, borderWidth: 2.5 } : null,
            pointStyle,
            pointOpacityStyle
          ]}
        >
          <View style={styles.pillIconContainer}>
            <SymbolView
              name={symbol(sectionIconName as SFSymbol, sectionIconName as AndroidSymbol)}
              tintColor={displayColor}
              size={16}
            />
          </View>
          <View style={styles.pillTextContainer}>
            <ThemedText style={styles.pointLabel} numberOfLines={1}>
              {label}
            </ThemedText>
            <ThemedText style={styles.pointAmount} numberOfLines={1}>
              {amountLabel}
            </ThemedText>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Info detail card displayed below the centered pill */}
      {isFocused && (
        <Animated.View 
          style={[
            styles.detailsCard,
            {
              left: centerX - 160 - (initialX - POINT_WIDTH / 2),
              top: centerY + 100 - (initialY - POINT_HEIGHT / 2),
              backgroundColor: theme.backgroundElement,
              borderColor: theme.backgroundSelected,
            },
            detailsStyle
          ]}
          pointerEvents={assigningTankId !== null ? "none" : "auto"}
        >
          <View style={styles.detailsCardHeader}>
            <View style={[styles.detailsSectionIcon, { backgroundColor: displayColor + '1F' }]}>
              <SymbolView 
                name={symbol(sectionIconName as SFSymbol, sectionIconName as AndroidSymbol)}
                tintColor={displayColor}
                size={12}
              />
            </View>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Detalles del Gasto
            </ThemedText>
          </View>
          <ThemedText style={styles.detailsLabel} numberOfLines={2}>
            {label}
          </ThemedText>
          <ThemedText style={[styles.detailsAmount, { color: theme.text }]}>
            {fullAmountLabel}
          </ThemedText>
          {frequency && nextDueDate && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.detailsMeta}>
              {`Frecuencia: ${frequency} • Vence: ${new Date(nextDueDate).toLocaleDateString('es-AR')}`}
            </ThemedText>
          )}
          <ThemedText type="code" style={styles.detailsHelper}>
            Arrastrá el gasto a un tanque o tocalo para asignarlo
          </ThemedText>
        </Animated.View>
      )}
    </View>
  );
}

// Memoizado: hay hasta MAX_FLOATING_BUBBLES instancias, cada una con ~8 shared
// values y gestos; sin memo, cualquier estado del padre las re-renderiza todas.
export const FloatingExpensePoint = memo(FloatingExpensePointComponent);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function MiniTankTargetView({
  tank,
  angle,
  centerX,
  centerY,
  initialX,
  initialY,
  detailsVisible,
  onPress,
  assigningTankId,
  hoveredTankId,
  rawAmount,
  isVariable,
  allowPartialAssignment,
}: {
  tank: MiniTankTarget;
  angle: number;
  centerX: number;
  centerY: number;
  initialX: number;
  initialY: number;
  detailsVisible: SharedValue<number>;
  onPress: () => void;
  assigningTankId: number | null;
  hoveredTankId: SharedValue<number | null>;
  rawAmount: number;
  isVariable: boolean;
  allowPartialAssignment: boolean;
}) {
  const theme = useTheme();
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 150 });
  }, [scale, opacity]);

  useEffect(() => {
    if (assigningTankId === tank.ruleId) {
      scale.value = withTiming(3, { duration: 300, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(0, { duration: 300 });
    }
  }, [assigningTankId, tank.ruleId, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    const isHovered = hoveredTankId.value === tank.ruleId;
    const isAssigned = assigningTankId === tank.ruleId;

    let currentScale = scale.value;
    if (isAssigned) {
      currentScale = scale.value;
    } else if (isHovered) {
      currentScale = withSpring(1.3, { damping: 24, stiffness: 500 });
    } else {
      currentScale = withSpring(scale.value, { damping: 24, stiffness: 500 });
    }

    return {
      transform: [{ scale: currentScale }],
      opacity: opacity.value,
    };
  });

  const animatedWrapperStyle = useAnimatedStyle(() => {
    // Calculate dynamic radius and offsets based on detailsVisible
    const baseRadius = 110;
    const expandedRadius = 150;
    const radius = interpolate(detailsVisible.value, [0, 1], [baseRadius, expandedRadius]);

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let xOffset = 0;
    let yOffset = 0;
    if (sinA > 0.1) { // bottom targets
      xOffset = (cosA > 0 ? 35 : -35) * detailsVisible.value;
      yOffset = -20 * detailsVisible.value;
    }

    const x = cosA * radius + xOffset;
    const y = sinA * radius + yOffset;

    const leftPos = centerX + x - (initialX - POINT_WIDTH / 2) - TANK_SIZE / 2;
    const topPos = centerY + y - (initialY - POINT_HEIGHT / 2) - TANK_SIZE / 2;

    return {
      transform: [
        { translateX: leftPos },
        { translateY: topPos },
      ],
    };
  });

  const previewStyle = useAnimatedStyle(() => {
    const isHovered = hoveredTankId.value === tank.ruleId;
    return {
      opacity: withTiming(isHovered ? 1 : 0, { duration: 120 }),
      transform: [{ scale: withTiming(isHovered ? 1 : 0.9, { duration: 120 }) }],
    };
  });

  // Montos estáticos por render (no dependen del gesto en curso): se
  // recalculan cada vez que cambian props, la visibilidad del card la maneja
  // solo previewStyle (leyendo hoveredTankId en el hilo de UI).
  const capacity = Math.max(tank.capacity, 1);
  const level = Math.max(tank.level, 0);
  const spentPct = Math.max(0, Math.min(100, ((capacity - level) / capacity) * 100));
  const insufficient = !isVariable && rawAmount > level;
  const isPartial = insufficient && allowPartialAssignment && level > 0;
  const willBeBlocked = insufficient && !isPartial;
  const assignAmount = willBeBlocked ? 0 : insufficient ? level : rawAmount;
  const remaining = Math.max(0, level - assignAmount);
  const remainingPct = Math.max(0, Math.min(100, (remaining / capacity) * 100));
  const consumePct = Math.max(0, Math.min(100, (assignAmount / capacity) * 100));

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[
        styles.miniTankWrapper,
        {
          left: 0,
          top: 0,
        },
        animatedWrapperStyle
      ]}
    >
      <Animated.View
        style={[
          styles.miniTank,
          animatedStyle,
          {
            backgroundColor: tank.color,
            shadowColor: tank.color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 5,
            elevation: 4,
          },
        ]}>
        <ThemedText type="smallBold" style={styles.miniTankLabel} numberOfLines={1}>
          {tank.label}
        </ThemedText>
      </Animated.View>

      {!isVariable && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tankPreviewCard,
            previewStyle,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: willBeBlocked ? URGENCY_OVERDUE_COLOR : theme.backgroundSelected,
            },
          ]}
        >
          <ThemedText type="smallBold" numberOfLines={1} style={styles.tankPreviewTitle}>
            {tank.label}
          </ThemedText>
          <View style={styles.tankPreviewBarTrack}>
            <View
              style={[
                styles.tankPreviewBarSegment,
                { flexBasis: `${spentPct}%`, backgroundColor: theme.backgroundSelected },
              ]}
            />
            {willBeBlocked ? (
              <View
                style={[
                  styles.tankPreviewBarSegment,
                  { flexBasis: `${100 - spentPct}%`, backgroundColor: TANK_COLOR },
                ]}
              />
            ) : (
              <>
                <View
                  style={[
                    styles.tankPreviewBarSegment,
                    { flexBasis: `${remainingPct}%`, backgroundColor: TANK_COLOR },
                  ]}
                />
                <View
                  style={[
                    styles.tankPreviewBarSegment,
                    { flexBasis: `${consumePct}%`, backgroundColor: URGENCY_OVERDUE_COLOR },
                  ]}
                />
              </>
            )}
          </View>
          {willBeBlocked ? (
            <>
              <ThemedText type="code" style={[styles.tankPreviewWarning, { color: URGENCY_OVERDUE_COLOR }]}>
                No alcanza el disponible
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tankPreviewLine}>
                {`Disponible: ${formatCurrency(level)} · Necesita: ${formatCurrency(rawAmount)}`}
              </ThemedText>
            </>
          ) : isPartial ? (
            <>
              <ThemedText type="small" style={styles.tankPreviewLine}>
                {`Se asigna ${formatCurrency(assignAmount)} acá`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tankPreviewLine}>
                {`Resto: ${formatCurrency(rawAmount - assignAmount)} queda como gasto recurrente nuevo`}
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText type="small" style={styles.tankPreviewLine}>
                {`Sacarías: ${formatCurrency(assignAmount)}`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tankPreviewLine}>
                {`Quedaría: ${formatCurrency(remaining)} (${remainingPct.toFixed(0)}%)`}
              </ThemedText>
            </>
          )}
        </Animated.View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: POINT_WIDTH,
    height: POINT_HEIGHT,
  },
  point: {
    width: POINT_WIDTH,
    height: POINT_HEIGHT,
    borderRadius: POINT_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  pillIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  pillTextContainer: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  pointLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  pointAmount: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  radialContainer: {
    position: 'absolute',
    width: POINT_WIDTH,
    height: POINT_HEIGHT,
  },
  miniTankWrapper: {
    position: 'absolute',
    width: TANK_SIZE,
    height: TANK_SIZE,
  },
  miniTank: {
    width: '100%',
    height: '100%',
    borderRadius: TANK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tankPreviewCard: {
    position: 'absolute',
    bottom: TANK_SIZE + 10,
    left: TANK_SIZE / 2 - 75,
    width: 150,
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.two,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  tankPreviewTitle: {
    fontSize: 12,
  },
  tankPreviewBarTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  tankPreviewBarSegment: {
    height: '100%',
  },
  tankPreviewLine: {
    fontSize: 11,
    lineHeight: 14,
  },
  tankPreviewWarning: {
    fontSize: 10,
    fontWeight: '700',
  },
  miniTankLabel: {
    color: '#fff',
    fontSize: 11,
  },
  detailsCard: {
    position: 'absolute',
    width: 320,
    borderRadius: 20,
    padding: Spacing.three,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    gap: 6,
    alignItems: 'center',
  },
  detailsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  detailsSectionIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsLabel: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  detailsAmount: {
    fontSize: 24,
    fontWeight: '800',
  },
  detailsMeta: {
    fontSize: 11,
  },
  detailsHelper: {
    fontSize: 10,
    color: TANK_COLOR,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
});
