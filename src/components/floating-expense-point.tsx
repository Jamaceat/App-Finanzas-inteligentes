/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from 'react';
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
} from 'react-native-reanimated';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

export type MiniTankTarget = {
  ruleId: number;
  label: string;
  color: string;
};

type Rect = { x: number; y: number; width: number; height: number };

export const POINT_WIDTH = 160;
export const POINT_HEIGHT = 52;
const TANK_SIZE = 80;
const RADIAL_RADIUS = 130;

export function FloatingExpensePoint({
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
  onAssign: (ruleId: number) => void;
  vibrationEnabled: boolean;
  onPositionChange: (key: string, x: number, y: number) => void;
}) {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const centerX = screenWidth / 2;
  const centerY = screenHeight / 2;

  const isFocused = focusedPointKey === pointKey;
  const anyFocused = focusedPointKey !== null;
  const isDimmed = anyFocused && !isFocused;

  const [assigningTankId, setAssigningTankId] = useState<number | null>(null);

  const translateX = useSharedValue(originX - initialX);
  const translateY = useSharedValue(originY - initialY);
  const wanderX = useSharedValue(0);
  const wanderY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isFreeDragging = useSharedValue(false);
  const hoveredTankId = useSharedValue<number | null>(null);
  const tankRects = useSharedValue<Record<number, Rect>>({});
  const pillScale = useSharedValue(1);

  // Sync positions when props change from non-drag sources (e.g. screen resize or filter change)
  useEffect(() => {
    if (!isDragging.value && !isFreeDragging.value) {
      translateX.value = originX - initialX;
      translateY.value = originY - initialY;
    }
  }, [originX, originY, initialX, initialY, translateX, translateY, isDragging, isFreeDragging]);

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

  useEffect(() => {
    if (isFocused) {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });
    } else {
      if (!isDragging.value && !isFreeDragging.value) {
        runOnUI(startWander)();
      }
    }
  }, [isFocused, wanderX, wanderY]);

  // Handle pill scale spring on focus (accelerated)
  useEffect(() => {
    if (assigningTankId === null) {
      pillScale.value = withSpring(isFocused ? 1.15 : 1, { damping: 15, stiffness: 180 });
    }
  }, [isFocused, assigningTankId, pillScale]);

  // Center flight trigger (accelerated)
  useEffect(() => {
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

  function registerTankRect(ruleId: number, rect: Rect) {
    tankRects.value = { ...tankRects.value, [ruleId]: rect };
  }

  function triggerHoverVibration() {
    if (vibrationEnabled) {
      Vibration.vibrate(30);
    }
  }

  function handleAssign(target: number) {
    if (assigningTankId !== null) return;

    if (vibrationEnabled) {
      Vibration.vibrate(100);
    }

    setAssigningTankId(target);

    const rect = tankRects.value[target];
    if (rect) {
      const targetCX = rect.x + rect.width / 2;
      const targetCY = rect.y + rect.height / 2;
      translateX.value = withTiming(targetCX - initialX, { duration: 300, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(targetCY - initialY, { duration: 300, easing: Easing.out(Easing.quad) });
    }
    pillScale.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });

    setTimeout(() => {
      onAssign(target);
      onSetFocused(null);
    }, 320);
  }

  const tap = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onSetFocused)(isFocused ? null : pointKey);
    });

  const pan = Gesture.Pan()
    .onBegin((event) => {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });

      if (isFocused) {
        isDragging.value = true;
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(screenWidth - POINT_WIDTH / 2, event.absoluteX));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(screenHeight - POINT_HEIGHT / 2, event.absoluteY));
        translateX.value = withSpring(clampedX - initialX, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(clampedY - initialY, { damping: 20, stiffness: 200 });
      } else {
        isFreeDragging.value = true;
      }
    })
    .onUpdate((event) => {
      if (isFocused) {
        const clampedX = Math.max(POINT_WIDTH / 2, Math.min(screenWidth - POINT_WIDTH / 2, event.absoluteX));
        const clampedY = Math.max(POINT_HEIGHT / 2, Math.min(screenHeight - POINT_HEIGHT / 2, event.absoluteY));
        translateX.value = clampedX - initialX;
        translateY.value = clampedY - initialY;
        
        let foundTarget: number | null = null;
        for (const key in tankRects.value) {
          const rect = tankRects.value[Number(key)];
          if (
            event.absoluteX >= rect.x &&
            event.absoluteX <= rect.x + rect.width &&
            event.absoluteY >= rect.y &&
            event.absoluteY <= rect.y + rect.height
          ) {
            foundTarget = Number(key);
            break;
          }
        }
        
        if (foundTarget !== hoveredTankId.value) {
          hoveredTankId.value = foundTarget;
          if (foundTarget !== null) {
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
        let target: number | null = null;
        for (const key in tankRects.value) {
          const rect = tankRects.value[Number(key)];
          if (
            event.absoluteX >= rect.x &&
            event.absoluteX <= rect.x + rect.width &&
            event.absoluteY >= rect.y &&
            event.absoluteY <= rect.y + rect.height
          ) {
            target = Number(key);
            break;
          }
        }
        
        if (target !== null) {
          runOnJS(handleAssign)(target);
        } else {
          translateX.value = withSpring(centerX - initialX, { damping: 18, stiffness: 180 });
          translateY.value = withSpring(centerY - initialY, { damping: 18, stiffness: 180 });
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
    
    let targetOpacity = 1;
    if (assigningTankId !== null) {
      targetOpacity = 0;
    } else if (isDimmed) {
      targetOpacity = 0.12;
    }

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: pillScale.value },
      ],
      opacity: withTiming(targetOpacity, { duration: 250 }),
    };
  });

  const sectionIconName = sectionIcon || 'tag.fill';
  const displayColor = sectionColor || color;

  return (
    <View
      style={[
        styles.wrapper, 
        { 
          left: initialX - POINT_WIDTH / 2, 
          top: initialY - POINT_HEIGHT / 2,
          zIndex: isFocused ? 20 : 1,
        }
      ]}
      pointerEvents={isDimmed ? "none" : "box-none"}
    >
      {/* Radial tanks targets centered around the screen center */}
      {isFocused && (
        <View style={styles.radialContainer} pointerEvents="box-none">
          {tanks.map((tank, index) => {
            const angle = (index / tanks.length) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * RADIAL_RADIUS;
            const y = Math.sin(angle) * RADIAL_RADIUS;
            
            const relativeLeft = centerX + x - (initialX - POINT_WIDTH / 2) - TANK_SIZE / 2;
            const relativeTop = centerY + y - (initialY - POINT_HEIGHT / 2) - TANK_SIZE / 2;
            
            return (
              <MiniTankTargetView
                key={tank.ruleId}
                tank={tank}
                left={relativeLeft}
                top={relativeTop}
                assigningTankId={assigningTankId}
                hoveredTankId={hoveredTankId}
                onMeasured={(rect) => registerTankRect(tank.ruleId, rect)}
                onPress={() => {
                  handleAssign(tank.ruleId);
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
            pointStyle
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
            }
          ]}
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

function MiniTankTargetView({
  tank,
  left,
  top,
  onMeasured,
  onPress,
  assigningTankId,
  hoveredTankId,
}: {
  tank: MiniTankTarget;
  left: number;
  top: number;
  onMeasured: (rect: Rect) => void;
  onPress: () => void;
  assigningTankId: number | null;
  hoveredTankId: SharedValue<number | null>;
}) {
  const ref = useRef<View>(null);
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

  function handleLayout() {
    ref.current?.measureInWindow((x, y, width, height) => {
      onMeasured({ x, y, width, height });
    });
  }

  const animatedStyle = useAnimatedStyle(() => {
    const isHovered = hoveredTankId.value === tank.ruleId;
    const isAssigned = assigningTankId === tank.ruleId;

    let currentScale = scale.value;
    if (isAssigned) {
      currentScale = scale.value;
    } else if (isHovered) {
      currentScale = withSpring(1.3, { damping: 12, stiffness: 180 });
    } else {
      currentScale = withSpring(scale.value, { damping: 12, stiffness: 180 });
    }

    return {
      transform: [{ scale: currentScale }],
      opacity: opacity.value,
    };
  });

  return (
    <Pressable 
      onPress={onPress}
      style={[
        styles.miniTankWrapper,
        {
          left: left,
          top: top,
        }
      ]}
    >
      <Animated.View
        ref={ref}
        onLayout={handleLayout}
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
    </Pressable>
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
