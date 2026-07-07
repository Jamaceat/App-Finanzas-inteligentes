import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getAppSettings,
  updateTankMaxRenewal,
  watchAppSettingsRow,
  updateVibrationEnabled,
  type TankMaxRenewalUnit,
} from '@/db/queries/settings';

const UNIT_OPTIONS: { value: TankMaxRenewalUnit; label: string }[] = [
  { value: 'days', label: 'Días' },
  { value: 'weeks', label: 'Semanas' },
  { value: 'months', label: 'Meses' },
  { value: 'years', label: 'Años' },
];

export default function SettingsScreen() {
  const { data: rows } = useLiveQuery(watchAppSettingsRow());
  const row = rows[0];

  useEffect(() => {
    if (!row) {
      getAppSettings();
    }
  }, [row]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Ajustes
        </ThemedText>

        {row && (
          <View style={styles.formsContainer}>
            <RenewalForm value={row.tankMaxRenewalValue} unit={row.tankMaxRenewalUnit} />
            <VibrationForm enabled={row.vibrationEnabled} />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function RenewalForm({ value, unit }: { value: number; unit: TankMaxRenewalUnit }) {
  const theme = useTheme();
  const [text, setText] = useState(String(value));
  const [selectedUnit, setSelectedUnit] = useState<TankMaxRenewalUnit>(unit);

  async function handleSave() {
    const parsed = Math.max(1, Number(text) || 1);
    await updateTankMaxRenewal(parsed, selectedUnit);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <ThemedText type="smallBold">Máximo del tanque Libre</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Define cada cuánto se renueva el máximo del tanque Libre (ingresos sin regla recurrente
        asociada).
      </ThemedText>

      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          placeholder="30"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />
        <View style={styles.chipRow}>
          {UNIT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={selectedUnit === option.value}
              onPress={() => setSelectedUnit(option.value)}
            />
          ))}
        </View>
      </View>

      <Pressable onPress={handleSave} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.submitButton}>
          <ThemedText type="smallBold">Guardar</ThemedText>
        </ThemedView>
      </Pressable>
    </ThemedView>
  );
}

function VibrationForm({ enabled }: { enabled: boolean }) {
  async function handleToggle(newValue: boolean) {
    await updateVibrationEnabled(newValue);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <View style={styles.vibrationHeader}>
        <View style={{ flex: 1, gap: Spacing.half }}>
          <ThemedText type="smallBold">Vibración al asignar gastos</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            El dispositivo vibrará brevemente al arrastrar o tocar un gasto para asignarlo a un tanque.
          </ThemedText>
        </View>
        <ThemedSwitch value={enabled} onValueChange={handleToggle} />
      </View>
    </ThemedView>
  );
}

function ThemedSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (val: boolean) => void;
}) {
  const theme = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 15, stiffness: 150 });
  }, [value, progress]);

  const toggleStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [theme.backgroundSelected, '#30A46C']
    );
    return {
      backgroundColor,
    };
  });

  const knobStyle = useAnimatedStyle(() => {
    const translateX = progress.value * 20;
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <Pressable onPress={() => onValueChange(!value)}>
      <Animated.View style={[styles.switchContainer, toggleStyle]}>
        <Animated.View style={[styles.switchKnob, { backgroundColor: '#ffffff' }, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={selected ? 'backgroundSelected' : 'background'} style={styles.chip}>
        <ThemedText type="small">{label}</ThemedText>
      </ThemedView>
    </Pressable>
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
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  formsContainer: {
    gap: Spacing.three,
  },
  form: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  row: {
    gap: Spacing.two,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    fontSize: 16,
    width: 96,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  submitButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  vibrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  switchContainer: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
