/* eslint-disable react-hooks/immutability */
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View, Vibration, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import {
  CLUSTER_BASE_SIZE,
  URGENCY_OVERDUE_COLOR,
  URGENCY_DUE_SOON_COLOR,
  EXPENSE_POINT_ENTRANCE_BASE_DELAY_MS,
  EXPENSE_POINT_ENTRANCE_STAGGER_MS,
  EXPENSE_POINT_ENTRANCE_DURATION_MS,
} from '@/constants/constants';
import type { Urgency } from '@/lib/bubble-visuals';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

function FloatingClusterBubbleComponent({
  nodeKey,
  label,
  sublabel,
  count,
  icon,
  color,
  urgency,
  sizeScale,
  originX,
  originY,
  initialX,
  initialY,
  isDimmed,
  vibrationEnabled,
  zIndex,
  onInteractionStart,
  onExpand,
  onPositionChange,
}: {
  nodeKey: string;
  label: string;
  sublabel: string;
  count: number;
  icon?: string;
  color: string;
  urgency: Urgency;
  sizeScale: number;
  originX: number;
  originY: number;
  initialX: number;
  initialY: number;
  isDimmed: boolean;
  vibrationEnabled: boolean;
  zIndex: number;
  onInteractionStart: (key: string) => void;
  onExpand: (key: string) => void;
  onPositionChange: (key: string, x: number, y: number) => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const translateX = useSharedValue(screenWidth - 65 - initialX);
  const translateY = useSharedValue(screenHeight - 65 - initialY);
  const wanderX = useSharedValue(0);
  const wanderY = useSharedValue(0);
  const isFreeDragging = useSharedValue(false);
  const bubbleScaleValue = useSharedValue(0);

  const isMountedRef = useRef(false);

  useEffect(() => {
    if (isMountedRef.current) {
      if (!isFreeDragging.value) {
        translateX.value = originX - initialX;
        translateY.value = originY - initialY;
      }
    } else {
      isMountedRef.current = true;
      const charCode = label.charCodeAt(0) || 0;
      const stagger = (charCode % 4) * EXPENSE_POINT_ENTRANCE_STAGGER_MS;
      const delay = EXPENSE_POINT_ENTRANCE_BASE_DELAY_MS + stagger;
      const entranceTiming = {
        duration: EXPENSE_POINT_ENTRANCE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      };
      bubbleScaleValue.value = withDelay(delay, withTiming(sizeScale, entranceTiming));
      translateX.value = withDelay(delay, withTiming(originX - initialX, entranceTiming));
      translateY.value = withDelay(delay, withTiming(originY - initialY, entranceTiming));
    }
  }, [originX, originY, initialX, initialY, translateX, translateY, isFreeDragging, bubbleScaleValue, label, sizeScale]);

  const startWander = () => {
    'worklet';
    const amp = 10 + Math.random() * 6;
    const dur = 3000 + Math.random() * 1600;
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

  // El vaivén se detiene si el cluster está atenuado (otro cluster está
  // expandido) para no gastar frames en burbujas que no se ven interactuar.
  useEffect(() => {
    if (isDimmed) {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });
    } else if (!isFreeDragging.value) {
      runOnUI(startWander)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDimmed]);

  const skipScaleMountRef = useRef(true);
  useEffect(() => {
    if (skipScaleMountRef.current) {
      skipScaleMountRef.current = false;
      return;
    }
    bubbleScaleValue.value = withSpring(sizeScale, { damping: 15, stiffness: 180 });
  }, [sizeScale, bubbleScaleValue]);

  function triggerTapVibration() {
    if (vibrationEnabled) Vibration.vibrate(30);
  }

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onInteractionStart)(nodeKey);
    runOnJS(triggerTapVibration)();
    runOnJS(onExpand)(nodeKey);
  });

  const pan = Gesture.Pan()
    .onBegin(() => {
      wanderX.value = withTiming(0, { duration: 150 });
      wanderY.value = withTiming(0, { duration: 150 });
      isFreeDragging.value = true;
      runOnJS(onInteractionStart)(nodeKey);
    })
    .onUpdate((event) => {
      const targetX = event.translationX + originX;
      const targetY = event.translationY + originY;
      const clampedX = Math.max(CLUSTER_BASE_SIZE / 2, Math.min(screenWidth - CLUSTER_BASE_SIZE / 2, targetX));
      const clampedY = Math.max(CLUSTER_BASE_SIZE / 2, Math.min(screenHeight - CLUSTER_BASE_SIZE / 2, targetY));
      translateX.value = clampedX - initialX;
      translateY.value = clampedY - initialY;
    })
    .onFinalize((event, success) => {
      isFreeDragging.value = false;
      if (success) {
        const targetX = originX + event.translationX;
        const targetY = originY + event.translationY;
        const clampedX = Math.max(CLUSTER_BASE_SIZE / 2, Math.min(screenWidth - CLUSTER_BASE_SIZE / 2, targetX));
        const clampedY = Math.max(CLUSTER_BASE_SIZE / 2, Math.min(screenHeight - CLUSTER_BASE_SIZE / 2, targetY));
        runOnJS(onPositionChange)(nodeKey, clampedX, clampedY);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
      if (!isDimmed) startWander();
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + wanderX.value },
      { translateY: translateY.value + wanderY.value },
      { scale: bubbleScaleValue.value },
    ],
  }));

  // Aparte del transform: aquel worklet corre en cada frame del wander/drag y
  // la opacidad solo cambia con isDimmed.
  const bubbleOpacityStyle = useAnimatedStyle(
    () => ({ opacity: withTiming(isDimmed ? 0.12 : 1, { duration: 250 }) }),
    [isDimmed],
  );

  const urgencyColor =
    urgency === 'overdue' ? URGENCY_OVERDUE_COLOR : urgency === 'dueSoon' ? URGENCY_DUE_SOON_COLOR : null;
  const iconName = icon || 'calendar';

  return (
    <View
      style={[
        styles.wrapper,
        { left: initialX - CLUSTER_BASE_SIZE / 2, top: initialY - CLUSTER_BASE_SIZE / 2, zIndex },
      ]}
      pointerEvents={isDimmed ? 'none' : 'box-none'}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.bubble,
            { backgroundColor: color, shadowColor: color },
            urgencyColor ? { borderColor: urgencyColor, borderWidth: 2.5 } : null,
            bubbleStyle,
            bubbleOpacityStyle,
          ]}
        >
          <View style={styles.countBadge}>
            <ThemedText style={[styles.countBadgeText, { color }]}>{count}</ThemedText>
          </View>
          <View style={styles.iconContainer}>
            <SymbolView name={symbol(iconName as SFSymbol, iconName as AndroidSymbol)} tintColor={color} size={18} />
          </View>
          <ThemedText style={styles.label} numberOfLines={1}>
            {label}
          </ThemedText>
          <ThemedText style={styles.sublabel} numberOfLines={1}>
            {sublabel}
          </ThemedText>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Memoizado: hay hasta MAX_CLUSTERS_ON_SCREEN instancias con shared values y
// gestos; sin memo, cualquier estado del padre las re-renderiza todas.
export const FloatingClusterBubble = memo(FloatingClusterBubbleComponent);

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: CLUSTER_BASE_SIZE,
    height: CLUSTER_BASE_SIZE,
  },
  bubble: {
    width: CLUSTER_BASE_SIZE,
    height: CLUSTER_BASE_SIZE,
    borderRadius: CLUSTER_BASE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  countBadge: {
    position: 'absolute',
    top: 4,
    right: 12,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  label: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  sublabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },
});
