import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  TANK_WIDTH,
  TANK_HEIGHT,
  TANK_ITEM_WIDTH,
  TANK_FILL_ANIMATION_DURATION_MS,
} from '@/constants/constants';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export type TankProps = {
  label: string;
  amount: number;
  capacity: number;
  color: string;
  tilt?: SharedValue<number>;
};

export function Tank({
  label,
  amount,
  capacity,
  color,
  tilt,
}: TankProps) {
  const ratio = Math.max(0, Math.min(1, amount / capacity));
  const percentage = Math.round(ratio * 100);
  const theme = useTheme();

  const fallbackTilt = useSharedValue(0);
  const activeTilt = tilt ?? fallbackTilt;

  const animatedTilt = useDerivedValue(() => {
    return withSpring(activeTilt.value);
  });

  const fillStyle = useAnimatedStyle(() => ({
    height: withTiming(`${ratio * 100}%`, { duration: TANK_FILL_ANIMATION_DURATION_MS }),
    transform: [{ rotate: `${animatedTilt.value}deg` }],
  }));

  const textColor = ratio >= 0.52 ? '#ffffff' : theme.text;

  return (
    <View style={styles.tankWrapper}>
      <ThemedView type="backgroundElement" style={styles.tankBody}>
        <Animated.View style={[styles.tankFill, { backgroundColor: color }, fillStyle]} />
        <View pointerEvents="none" style={styles.percentageContainer}>
          <Text style={[styles.percentageText, { color: textColor }]}>
            {percentage}%
          </Text>
        </View>
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

const styles = StyleSheet.create({
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
  percentageContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentageText: {
    fontSize: 22,
    fontWeight: '800',
  },
});
