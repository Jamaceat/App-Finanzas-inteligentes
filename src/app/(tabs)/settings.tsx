import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
  updateVibrationEnabled,
  updateCalendarSimulationOccurrences,
  updateRestrictPastStartDates,
  updateTransactionsPageSize,
  updateAllowPartialTankAssignment,
  resetAllData,
  type TankMaxRenewalUnit,
} from '@/db/queries/settings';
import { useAppSettingsRows } from '@/providers/app-data';

const UNIT_OPTIONS: { value: TankMaxRenewalUnit; label: string }[] = [
  { value: 'days', label: 'Días' },
  { value: 'weeks', label: 'Semanas' },
  { value: 'months', label: 'Meses' },
  { value: 'years', label: 'Años' },
];

export default function SettingsScreen() {
  const rows = useAppSettingsRows();
  const row = rows[0];

  useEffect(() => {
    if (!row) {
      getAppSettings();
    }
  }, [row]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="title" style={styles.title}>
            Ajustes
          </ThemedText>

          {row && (
            <View style={styles.formsContainer}>
              <RenewalForm value={row.tankMaxRenewalValue} unit={row.tankMaxRenewalUnit} />
              <SimulationForm value={row.calendarSimulationOccurrences} />
              <TransactionsPageSizeForm value={row.transactionsPageSize} />
              <VibrationForm enabled={row.vibrationEnabled} />
              <RestrictPastDatesForm enabled={row.restrictPastStartDates} />
              <AllowPartialTankAssignmentForm enabled={row.allowPartialTankAssignment} />
              <ResetDataForm />
            </View>
          )}
        </ScrollView>
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

function SimulationForm({ value }: { value: number }) {
  const theme = useTheme();
  const [text, setText] = useState(String(value));

  async function handleSave() {
    const parsed = Math.max(1, Number(text) || 1);
    await updateCalendarSimulationOccurrences(parsed);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <ThemedText type="smallBold">Ocurrencias a simular en calendario</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Define cuántas ocurrencias de reglas recurrentes se simularán y mostrarán en el calendario a partir del punto de partida.
      </ThemedText>

      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          placeholder="24"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />
      </View>

      <Pressable onPress={handleSave} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.submitButton}>
          <ThemedText type="smallBold">Guardar</ThemedText>
        </ThemedView>
      </Pressable>
    </ThemedView>
  );
}

function TransactionsPageSizeForm({ value }: { value: number }) {
  const theme = useTheme();
  const [text, setText] = useState(String(value));

  async function handleSave() {
    const parsed = Math.max(1, Number(text) || 1);
    await updateTransactionsPageSize(parsed);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <ThemedText type="smallBold">Máximo de elementos por página</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Define cuántos movimientos se muestran por página en la pantalla de Movimientos.
      </ThemedText>

      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          placeholder="20"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />
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

function RestrictPastDatesForm({ enabled }: { enabled: boolean }) {
  async function handleToggle(newValue: boolean) {
    await updateRestrictPastStartDates(newValue);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <View style={styles.vibrationHeader}>
        <View style={{ flex: 1, gap: Spacing.half }}>
          <ThemedText type="smallBold">No permitir fechas pasadas</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Al crear o editar una regla recurrente, no se podrá elegir un punto de partida
            anterior a hoy.
          </ThemedText>
        </View>
        <ThemedSwitch value={enabled} onValueChange={handleToggle} />
      </View>
    </ThemedView>
  );
}

function AllowPartialTankAssignmentForm({ enabled }: { enabled: boolean }) {
  async function handleToggle(newValue: boolean) {
    await updateAllowPartialTankAssignment(newValue);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <View style={styles.vibrationHeader}>
        <View style={{ flex: 1, gap: Spacing.half }}>
          <ThemedText type="smallBold">Asignación parcial de gastos</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Si el disponible del tanque no alcanza para todo el gasto, se asigna lo que haya y el
            resto queda como una regla recurrente nueva para asignar después. Si está desactivado,
            no se va a permitir soltar el gasto en un tanque sin fondos suficientes.
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
function ResetDataForm() {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setLoading(true);
    try {
      await resetAllData();
      setModalVisible(false);
    } catch (error) {
      console.error('Error resetting database:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ThemedView type="backgroundElement" style={styles.form}>
        <ThemedText type="smallBold" style={{ color: '#E5484D' }}>Zona de Peligro</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Elimina de forma irreversible todos los ingresos, gastos, reglas recurrentes, tanques y metas de ahorro. Se mantendrá la sección por defecto "General".
        </ThemedText>

        <Pressable onPress={() => setModalVisible(true)} style={({ pressed }) => pressed && styles.pressed}>
          <View style={[styles.submitButton, { backgroundColor: '#E5484D' }]}>
            <ThemedText type="smallBold" style={{ color: '#ffffff' }}>Reiniciar todos los datos</ThemedText>
          </View>
        </Pressable>
      </ThemedView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !loading && setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              <ThemedText type="smallBold" style={[styles.modalTitle, { color: '#E5484D' }]}>
                ¿Confirmar reinicio de datos?
              </ThemedText>
              
              <ThemedText type="small" themeColor="textSecondary">
                Esta acción es irreversible y borrará permanentemente:
              </ThemedText>

              <View style={{ gap: Spacing.one, paddingLeft: Spacing.two }}>
                <ThemedText type="small">• Todos los movimientos de ingresos y gastos.</ThemedText>
                <ThemedText type="small">• Todas las reglas recurrentes y tanques.</ThemedText>
                <ThemedText type="small">• Todos los objetivos de ahorro.</ThemedText>
                <ThemedText type="small">• Todas las secciones / categorías creadas por ti.</ThemedText>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setModalVisible(false)}
                  disabled={loading}
                  style={({ pressed }) => [pressed && styles.pressed, loading && styles.disabledButton]}
                >
                  <ThemedView type="background" style={styles.modalButton}>
                    <ThemedText type="small">Cancelar</ThemedText>
                  </ThemedView>
                </Pressable>

                <Pressable
                  onPress={handleReset}
                  disabled={loading}
                  style={({ pressed }) => [pressed && styles.pressed, loading && styles.disabledButton]}
                >
                  <View style={[styles.modalButton, { backgroundColor: '#E5484D', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}>
                    {loading && <ActivityIndicator size="small" color="#ffffff" />}
                    <ThemedText type="smallBold" style={{ color: '#ffffff' }}>Sí, reiniciar todo</ThemedText>
                  </View>
                </Pressable>
              </View>
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>
    </>
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
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderRadius: Spacing.four,
  },
  modalScrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  modalButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  disabledButton: {
    opacity: 0.4,
  },
});
