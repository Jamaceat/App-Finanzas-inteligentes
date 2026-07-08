import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  archiveRecurringRule,
  createRecurringRule,
  listActiveRecurringRules,
  updateRecurringRule,
  type CustomIntervalUnit,
  type RecurringFrequency,
  type RecurringKind,
} from '@/db/queries/recurring-rules';
import { getOrCreateDefaultSection, listActiveSections } from '@/db/queries/sections';
import { advanceDate } from '@/db/queries/tanks';
import { cancelRuleReminder } from '@/lib/notifications';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrencyInput(digits: string): string {
  const cents = Number(digits || '0');
  return currencyFormatter.format(cents / 100);
}

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
];

const CUSTOM_UNIT_OPTIONS: { value: CustomIntervalUnit; label: string }[] = [
  { value: 'days', label: 'Días' },
  { value: 'weeks', label: 'Semanas' },
];

type Rule = {
  id: number;
  sectionId: number;
  label: string;
  kind: RecurringKind;
  frequency: RecurringFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: CustomIntervalUnit | null;
  isVariableAmount: boolean;
  estimatedAmount: number | null;
  nextDueDate: Date;
  reminderEnabled: boolean;
};

function frequencyDescription(rule: Rule): string | undefined {
  const option = FREQUENCY_OPTIONS.find((o) => o.value === rule.frequency);
  if (rule.frequency !== 'custom') {
    return option?.label;
  }
  const unitLabel = CUSTOM_UNIT_OPTIONS.find((u) => u.value === rule.customIntervalUnit)?.label;
  return `Cada ${rule.customIntervalValue ?? 1} ${(unitLabel ?? 'Días').toLowerCase()}`;
}

export default function RecurringRulesScreen() {
  const params = useLocalSearchParams<{ kind?: RecurringKind; variable?: string }>();
  const { data: rules } = useLiveQuery(listActiveRecurringRules());
  const { data: sections } = useLiveQuery(listActiveSections());
  const [editingId, setEditingId] = useState<number | null>(null);

  const editingRule = rules.find((rule) => rule.id === editingId);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="title" style={styles.title}>
            Reglas recurrentes
          </ThemedText>

          <RuleForm
            key={editingRule?.id ?? 'new'}
            editing={editingRule}
            sections={sections}
            initialKind={params.kind}
            initialVariable={params.variable === '1'}
            onDone={() => setEditingId(null)}
          />

          <ThemedView style={styles.list}>
            {rules.length === 0 && (
              <ThemedText themeColor="textSecondary">Sin reglas recurrentes todavía.</ThemedText>
            )}
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                sectionName={sections.find((section) => section.id === rule.sectionId)?.name}
                isEditing={rule.id === editingId}
                onEdit={() => setEditingId(rule.id === editingId ? null : rule.id)}
                onArchive={() => {
                  if (editingId === rule.id) {
                    setEditingId(null);
                  }
                  archiveRecurringRule(rule.id);
                  cancelRuleReminder(rule.id);
                }}
              />
            ))}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function RuleRow({
  rule,
  sectionName,
  isEditing,
  onEdit,
  onArchive,
}: {
  rule: Rule;
  sectionName?: string;
  isEditing: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <ThemedView type={isEditing ? 'backgroundSelected' : 'backgroundElement'} style={styles.row}>
      <View style={styles.rowMain}>
        <ThemedText type="smallBold">{rule.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {rule.kind === 'income' ? 'Ingreso' : 'Gasto'} · {frequencyDescription(rule)} ·{' '}
          {sectionName ?? 'Sin sección'}
          {rule.isVariableAmount
            ? ' · Variable'
            : rule.estimatedAmount != null
              ? ` · ${currencyFormatter.format(rule.estimatedAmount)}`
              : ''}
          {rule.reminderEnabled ? ' · Recordatorio' : ''}
        </ThemedText>
      </View>
      <Pressable onPress={onEdit} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" themeColor="textSecondary">
          Editar
        </ThemedText>
      </Pressable>
      <Pressable onPress={onArchive} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" style={{ color: '#E5484D' }}>
          Archivar
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function RuleForm({
  editing,
  sections,
  initialKind,
  initialVariable,
  onDone,
}: {
  editing?: Rule;
  sections: { id: number; name: string }[];
  initialKind?: RecurringKind;
  initialVariable?: boolean;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [kind, setKind] = useState<RecurringKind>(editing?.kind ?? initialKind ?? 'expense');
  const [frequency, setFrequency] = useState<RecurringFrequency>(editing?.frequency ?? 'monthly');
  const [customValue, setCustomValue] = useState(
    editing?.customIntervalValue != null ? String(editing.customIntervalValue) : '1',
  );
  const [customUnit, setCustomUnit] = useState<CustomIntervalUnit>(
    editing?.customIntervalUnit ?? 'days',
  );
  const [isVariableAmount, setIsVariableAmount] = useState(
    editing?.isVariableAmount ?? initialVariable ?? false,
  );
  const [amountDigits, setAmountDigits] = useState(
    editing?.estimatedAmount != null ? String(Math.round(editing.estimatedAmount * 100)) : '',
  );
  const [sectionId, setSectionId] = useState<number | undefined>(editing?.sectionId);
  const [startDate, setStartDate] = useState<Date>(editing?.nextDueDate ?? new Date());
  const [reminderEnabled, setReminderEnabled] = useState(editing?.reminderEnabled ?? true);

  const formattedAmount = formatCurrencyInput(amountDigits);
  const customValueNumber = Math.max(1, Number(customValue) || 1);

  const upcomingDates = simulateOccurrences(startDate, frequency, customValueNumber, customUnit);

  function handleAmountChange(text: string) {
    const digitsOnly = text.replace(/\D/g, '');
    setAmountDigits(digitsOnly.replace(/^0+(?=\d)/, ''));
  }

  function handleCustomValueChange(text: string) {
    setCustomValue(text.replace(/\D/g, ''));
  }

  async function handleSubmit() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      return;
    }

    const estimatedAmount = isVariableAmount
      ? null
      : amountDigits
        ? Number(amountDigits) / 100
        : null;

    const resolvedSectionId = sectionId ?? (await getOrCreateDefaultSection()).id;

    const isCustom = frequency === 'custom';

    if (editing) {
      await updateRecurringRule(editing.id, {
        sectionId: resolvedSectionId,
        label: trimmedLabel,
        kind,
        frequency,
        customIntervalValue: isCustom ? customValueNumber : null,
        customIntervalUnit: isCustom ? customUnit : null,
        isVariableAmount,
        estimatedAmount,
        nextDueDate: startDate,
        reminderEnabled,
      });
    } else {
      await createRecurringRule({
        sectionId: resolvedSectionId,
        label: trimmedLabel,
        kind,
        frequency,
        customIntervalValue: isCustom ? customValueNumber : null,
        customIntervalUnit: isCustom ? customUnit : null,
        isVariableAmount,
        estimatedAmount: estimatedAmount ?? undefined,
        nextDueDate: startDate,
        reminderEnabled,
      });
      setLabel('');
      setAmountDigits('');
      setStartDate(new Date());
    }

    onDone();
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Nombre (ej. Alquiler, Sueldo)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />

      <View style={styles.chipRow}>
        <Chip label="Gasto" selected={kind === 'expense'} onPress={() => setKind('expense')} />
        <Chip label="Ingreso" selected={kind === 'income'} onPress={() => setKind('income')} />
      </View>

      <View style={styles.chipRow}>
        {FREQUENCY_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={frequency === option.value}
            onPress={() => setFrequency(option.value)}
          />
        ))}
      </View>

      {frequency === 'custom' && (
        <View style={styles.customRow}>
          <TextInput
            value={customValue}
            onChangeText={handleCustomValueChange}
            placeholder="Cada..."
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[styles.customInput, { color: theme.text, backgroundColor: theme.background }]}
          />
          <View style={styles.chipRow}>
            {CUSTOM_UNIT_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={customUnit === option.value}
                onPress={() => setCustomUnit(option.value)}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.chipRow}>
        <Chip label="Fijo" selected={!isVariableAmount} onPress={() => setIsVariableAmount(false)} />
        <Chip label="Variable" selected={isVariableAmount} onPress={() => setIsVariableAmount(true)} />
      </View>

      {!isVariableAmount && (
        <TextInput
          value={formattedAmount}
          onChangeText={handleAmountChange}
          placeholder="Monto estimado"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />
      )}

      {sections.length > 0 && (
        <View style={styles.chipRow}>
          {sections.map((section) => (
            <Chip
              key={section.id}
              label={section.name}
              selected={sectionId === section.id}
              onPress={() => setSectionId(section.id)}
            />
          ))}
        </View>
      )}

      <View style={styles.chipRow}>
        <Chip
          label="Recordatorio activado"
          selected={reminderEnabled}
          onPress={() => setReminderEnabled(true)}
        />
        <Chip
          label="Sin recordatorio"
          selected={!reminderEnabled}
          onPress={() => setReminderEnabled(false)}
        />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Punto de partida
      </ThemedText>
      <MiniCalendar
        value={startDate}
        onChange={setStartDate}
        highlightDates={upcomingDates}
        highlightColor={kind === 'income' ? '#30A46C' : '#E5484D'}
      />

      <View style={styles.formActions}>
        {editing && (
          <Pressable onPress={onDone} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="background" style={styles.submitButton}>
              <ThemedText type="smallBold">Cancelar</ThemedText>
            </ThemedView>
          </Pressable>
        )}
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [styles.submitFlex, pressed && styles.pressed]}>
          <ThemedView type="backgroundSelected" style={styles.submitButton}>
            <ThemedText type="smallBold">{editing ? 'Guardar' : 'Crear regla'}</ThemedText>
          </ThemedView>
        </Pressable>
      </View>
    </ThemedView>
  );
}

function simulateOccurrences(
  start: Date,
  frequency: RecurringFrequency,
  customIntervalValue: number,
  customIntervalUnit: CustomIntervalUnit,
  count = 8,
): Date[] {
  const dates: Date[] = [];
  let current = new Date(start);
  for (let i = 0; i < count; i++) {
    current = advanceDate(current, frequency, customIntervalValue, customIntervalUnit);
    dates.push(new Date(current));
  }
  return dates;
}

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

function MiniCalendar({
  value,
  onChange,
  highlightDates,
  highlightColor,
}: {
  value: Date;
  onChange: (date: Date) => void;
  highlightDates: Date[];
  highlightColor: string;
}) {
  const theme = useTheme();
  const [viewDate, setViewDate] = useState(new Date(value.getFullYear(), value.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  function goToMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
  }

  return (
    <ThemedView type="background" style={styles.calendar}>
      <View style={styles.calendarHeader}>
        <Pressable onPress={() => goToMonth(-1)} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="smallBold">‹</ThemedText>
        </Pressable>
        <ThemedText type="small" style={styles.calendarMonthLabel}>
          {monthFormatter.format(viewDate)}
        </ThemedText>
        <Pressable onPress={() => goToMonth(1)} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="smallBold">›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.calendarWeekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <ThemedText key={index} type="small" themeColor="textSecondary" style={styles.calendarCell}>
            {label}
          </ThemedText>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {cells.map((date, index) => {
          if (!date) {
            return <View key={index} style={styles.calendarCell} />;
          }

          const isSelected = isSameDay(date, value);
          const isHighlighted = !isSelected && highlightDates.some((d) => isSameDay(d, date));

          return (
            <Pressable
              key={index}
              onPress={() => onChange(date)}
              style={({ pressed }) => [styles.calendarCell, pressed && styles.pressed]}>
              <View
                style={[
                  styles.calendarDay,
                  isSelected && { backgroundColor: theme.backgroundSelected },
                  isHighlighted && { borderColor: highlightColor, borderWidth: 1.5 },
                ]}>
                <ThemedText type="small">{date.getDate()}</ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
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
  form: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    fontSize: 16,
  },
  customRow: {
    gap: Spacing.two,
  },
  customInput: {
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
  formActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  submitFlex: {
    flex: 1,
  },
  submitButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
  calendar: {
    borderRadius: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  calendarMonthLabel: {
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDay: {
    width: '80%',
    height: '80%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
