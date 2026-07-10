import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { FilterChip } from '@/components/filter-chip';
import { PaginationControls } from '@/components/pagination-controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { DEFAULT_SIMULATION_OCCURRENCES } from '@/constants/constants';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePagination } from '@/hooks/use-pagination';
import {
  archiveRecurringRule,
  countActiveRecurringRules,
  createRecurringRule,
  listActiveRecurringRules,
  replaceRecurringRule,
  type CustomIntervalUnit,
  type RecurringFrequency,
  type RecurringKind,
} from '@/db/queries/recurring-rules';
import { getOrCreateDefaultSection } from '@/db/queries/sections';
import {
  addInterval,
  advanceDate,
  computeFreeCashTank,
  computeIncomeTanks,
  computePendingConfirmations,
  computeSpecialTanks,
  type PendingConfirmation,
} from '@/db/queries/tanks';
import {
  useActiveRules,
  useActiveSections,
  useAllRules,
  useAppSettingsRows,
  useTankTransactions,
} from '@/providers/app-data';
import { cancelRuleReminder } from '@/lib/notifications';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

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
  createdAt: Date;
};

const createdAtFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

function frequencyDescription(rule: Rule): string | undefined {
  const option = FREQUENCY_OPTIONS.find((o) => o.value === rule.frequency);
  if (rule.frequency !== 'custom') {
    return option?.label;
  }
  const unitLabel = CUSTOM_UNIT_OPTIONS.find((u) => u.value === rule.customIntervalUnit)?.label;
  return `Cada ${rule.customIntervalValue ?? 1} ${(unitLabel ?? 'Días').toLowerCase()}`;
}

const RULES_PAGE_SIZE = 10;

export default function RecurringRulesScreen() {
  const params = useLocalSearchParams<{ kind?: RecurringKind; variable?: string }>();
  const [kindFilter, setKindFilter] = useState<RecurringKind | undefined>(params.kind);
  const [searchText, setSearchText] = useState('');
  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();
  const settings = settingsRows?.[0];
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: ruleCountRows } = useLiveQuery(
    countActiveRecurringRules({ kind: kindFilter, search: searchText }),
    [kindFilter, searchText],
  );
  const pagination = usePagination({
    pageSize: RULES_PAGE_SIZE,
    totalCount: ruleCountRows[0]?.count ?? 0,
    resetKey: `${kindFilter ?? 'all'}:${searchText}`,
  });
  const { data: rules } = useLiveQuery(
    listActiveRecurringRules({
      kind: kindFilter,
      search: searchText,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [kindFilter, searchText, pagination.offset, pagination.pageSize],
  );

  const editingRule = rules.find((rule) => rule.id === editingId);
  const simulationOccurrences = settings?.calendarSimulationOccurrences ?? DEFAULT_SIMULATION_OCCURRENCES;
  const restrictPastStartDates = settings?.restrictPastStartDates ?? false;

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
            simulationOccurrences={simulationOccurrences}
            restrictPastStartDates={restrictPastStartDates}
            onDone={() => setEditingId(null)}
          />

          <RuleSearchBar value={searchText} onChangeText={setSearchText} />

          <View style={styles.chipRow}>
            <FilterChip label="Todas" selected={kindFilter === undefined} onPress={() => setKindFilter(undefined)} />
            <FilterChip label="Gasto" selected={kindFilter === 'expense'} onPress={() => setKindFilter('expense')} />
            <FilterChip label="Ingreso" selected={kindFilter === 'income'} onPress={() => setKindFilter('income')} />
          </View>

          <PaginationControls
            page={pagination.page}
            pageCount={pagination.pageCount}
            hasPreviousPage={pagination.hasPreviousPage}
            hasNextPage={pagination.hasNextPage}
            onPrevious={pagination.goToPreviousPage}
            onNext={pagination.goToNextPage}
            onGoToPage={pagination.goToPage}
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

          <PaginationControls
            page={pagination.page}
            pageCount={pagination.pageCount}
            hasPreviousPage={pagination.hasPreviousPage}
            hasNextPage={pagination.hasNextPage}
            onPrevious={pagination.goToPreviousPage}
            onNext={pagination.goToNextPage}
            onGoToPage={pagination.goToPage}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function RuleSearchBar({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.searchBar}>
      <SymbolView name={symbol('magnifyingglass', 'search')} tintColor={theme.textSecondary} size={18} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Buscar por nombre..."
        placeholderTextColor={theme.textSecondary}
        style={[styles.searchInput, { color: theme.text }]}
        clearButtonMode="while-editing"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} style={({ pressed }) => pressed && styles.pressed}>
          <SymbolView name={symbol('xmark.circle.fill', 'cancel')} tintColor={theme.textSecondary} size={16} />
        </Pressable>
      )}
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
          Desactivar
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
  simulationOccurrences,
  restrictPastStartDates,
  onDone,
}: {
  editing?: Rule;
  sections: { id: number; name: string }[];
  initialKind?: RecurringKind;
  initialVariable?: boolean;
  simulationOccurrences: number;
  restrictPastStartDates: boolean;
  onDone: () => void;
}) {
  const theme = useTheme();
  const activeRules = useActiveRules();
  const allRules = useAllRules();
  const transactions = useTankTransactions();
  const appSettingsRows = useAppSettingsRows();
  const [pendingBackfill, setPendingBackfill] = useState<PendingConfirmation | null>(null);
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
  const [startDate, setStartDate] = useState<Date>(() => {
    const initial = editing?.nextDueDate ?? new Date();
    const today = startOfToday();
    return restrictPastStartDates && initial < today ? today : initial;
  });
  const [reminderEnabled, setReminderEnabled] = useState(editing?.reminderEnabled ?? true);

  const formattedAmount = formatCurrencyInput(amountDigits);
  const customValueNumber = Math.max(1, Number(customValue) || 1);

  // Memoizado: sin esto se re-simulan todas las ocurrencias (y se re-renderiza
  // el MiniCalendar con array nuevo) en cada tecleo del formulario.
  const upcomingDates = useMemo(
    () => simulateOccurrences(startDate, frequency, customValueNumber, customUnit, simulationOccurrences),
    [startDate, frequency, customValueNumber, customUnit, simulationOccurrences],
  );

  // Solo se usan si, tras guardar, la regla queda con ciclos vencidos por
  // confirmar (fecha de inicio pasada) y hay que mostrar el checklist.
  const incomeTanks = useMemo(
    () => computeIncomeTanks(activeRules, transactions, allRules),
    [activeRules, transactions, allRules],
  );
  const specialTanks = useMemo(
    () => computeSpecialTanks(activeRules, transactions),
    [activeRules, transactions],
  );
  const freeCashTank = useMemo(() => {
    const settingsRow = appSettingsRows?.[0];
    const tankMaxRenewalValue = settingsRow?.tankMaxRenewalValue ?? 30;
    const tankMaxRenewalUnit = settingsRow?.tankMaxRenewalUnit ?? 'days';
    const windowStart = addInterval(new Date(), -tankMaxRenewalValue, tankMaxRenewalUnit);
    return computeFreeCashTank(activeRules, transactions, windowStart, allRules);
  }, [activeRules, transactions, appSettingsRows, allRules]);

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

    let created;
    if (editing) {
      // Desactivar regla anterior (preserva el historial) y crear la nueva versión,
      // en una sola transacción/commit.
      created = await replaceRecurringRule(editing.id, {
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
    } else {
      [created] = await createRecurringRule({
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

    // Si la fecha de inicio elegida ya venció, esta regla arranca con ciclos
    // pendientes: se ofrece confirmarlos ahora mismo (con checklist) en vez de
    // dejarlos silenciosamente esperando en la pestaña Confirmar. Los ciclos que
    // ya se habían confirmado bajo una versión anterior de la regla (linaje vía
    // previousRuleId) quedan excluidos automáticamente, así no se duplican.
    const now = new Date();
    if (created.nextDueDate < now) {
      const [confirmation] = computePendingConfirmations([created], created.kind, {
        allRules: [...allRules, { id: created.id, previousRuleId: created.previousRuleId }],
        transactions,
      });
      if (confirmation) {
        setPendingBackfill(confirmation);
        return;
      }
    }

    onDone();
  }

  return (
    <View style={styles.formWrapper}>
      {editing && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.createdAtText}>
          Creada el {createdAtFormatter.format(editing.createdAt)}
        </ThemedText>
      )}
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
          minDate={restrictPastStartDates ? startOfToday() : undefined}
          originStartDate={editing?.nextDueDate}
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

      {pendingBackfill && (
        <ConfirmationModal
          confirmation={pendingBackfill}
          incomeTanks={incomeTanks}
          specialTanks={specialTanks}
          freeCashTank={freeCashTank}
          transactions={transactions}
          allRules={allRules}
          onClose={() => {
            setPendingBackfill(null);
            onDone();
          }}
        />
      )}
    </View>
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function simulateOccurrences(
  start: Date,
  frequency: RecurringFrequency,
  customIntervalValue: number,
  customIntervalUnit: CustomIntervalUnit,
  count: number,
): Date[] {
  const dates: Date[] = [];
  let current = new Date(start);
  for (let i = 0; i < count; i++) {
    current = advanceDate(current, frequency, customIntervalValue, customIntervalUnit);
    dates.push(new Date(current));
  }
  return dates;
}

const ORIGIN_COLOR = '#0091FF';

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function dayKey(date: Date): number {
  return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
}

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

function MiniCalendar({
  value,
  onChange,
  highlightDates,
  highlightColor,
  minDate,
  originStartDate,
}: {
  value: Date;
  onChange: (date: Date) => void;
  highlightDates: Date[];
  highlightColor: string;
  minDate?: Date;
  originStartDate?: Date;
}) {
  const theme = useTheme();
  const [viewDate, setViewDate] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const [containerWidth, setContainerWidth] = useState(0);

  // Set de días resaltados: evita highlightDates.some(isSameDay) por cada una
  // de las 42 celdas de la grilla.
  const highlightDayKeys = useMemo(
    () => new Set(highlightDates.map(dayKey)),
    [highlightDates],
  );

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

  function goToToday() {
    const today = new Date();
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function goToOrigin() {
    if (!originStartDate) return;
    setViewDate(new Date(originStartDate.getFullYear(), originStartDate.getMonth(), 1));
  }

  const gridWidth = containerWidth > 0 ? Math.round(containerWidth - Spacing.two * 2) : 0;
  const cellWidth = gridWidth > 0 ? Math.floor(gridWidth / 7) : undefined;
  const daySize = cellWidth ? Math.floor(cellWidth * 0.8) : undefined;
  const dayRadius = daySize ? Math.floor(daySize / 2) : undefined;

  const cellStyle = cellWidth ? { width: cellWidth, height: cellWidth } : styles.calendarCell;
  const dayStyle = daySize && dayRadius
    ? {
        width: daySize,
        height: daySize,
        borderRadius: dayRadius,
        overflow: 'hidden' as const,
      }
    : styles.calendarDay;

  return (
    <ThemedView
      type="background"
      style={styles.calendar}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.calendarHeader}>
        <Pressable
          onPress={() => goToMonth(-1)}
          style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressed]}
        >
          <ThemedText style={styles.monthNavText}>‹</ThemedText>
        </Pressable>
        <ThemedText style={styles.calendarMonthLabel}>
          {monthFormatter.format(viewDate)}
        </ThemedText>
        <Pressable
          onPress={() => goToMonth(1)}
          style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressed]}
        >
          <ThemedText style={styles.monthNavText}>›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.calendarActionsRow}>
        <Pressable
          onPress={goToToday}
          style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
        >
          <ThemedText type="small" themeColor="textSecondary">
            Hoy
          </ThemedText>
        </Pressable>
        {originStartDate && (
          <Pressable
            onPress={goToOrigin}
            style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Inicio del ciclo
            </ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.calendarWeekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <View key={index} style={[styles.calendarCell, cellStyle]}>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {cells.map((date, index) => {
          if (!date) {
            return <View key={index} style={[styles.calendarCell, cellStyle]} />;
          }

          const isSelected = isSameDay(date, value);
          const isHighlighted = !isSelected && highlightDayKeys.has(dayKey(date));
          const isDisabled = minDate != null && date < minDate && !isSameDay(date, minDate);
          const isOrigin = originStartDate != null && isSameDay(date, originStartDate);
          const isToday = isSameDay(date, new Date());

          return (
            <Pressable
              key={index}
              disabled={isDisabled}
              onPress={() => onChange(date)}
              style={({ pressed }) => [styles.calendarCell, cellStyle, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.calendarDay,
                  dayStyle,
                  {
                    backgroundColor: isOrigin && !isSelected
                      ? ORIGIN_COLOR
                      : isSelected
                        ? theme.backgroundSelected
                        : 'transparent',
                    borderColor: isOrigin
                      ? ORIGIN_COLOR
                      : isHighlighted
                        ? highlightColor
                        : 'transparent',
                    borderWidth: isOrigin ? 2.5 : 1.5,
                    opacity: isDisabled ? 0.3 : 1,
                  },
                ]}
              >
                <ThemedText
                  type="small"
                  style={[
                    isOrigin && !isSelected ? styles.originDayText : undefined,
                    isToday && !isSelected && !isOrigin ? { fontWeight: 'bold' } : undefined,
                  ]}
                >
                  {date.getDate()}
                </ThemedText>
                {isToday && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: isOrigin && !isSelected
                        ? '#ffffff'
                        : isSelected
                          ? theme.text
                          : ORIGIN_COLOR,
                    }}
                  />
                )}
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
  formWrapper: {
    gap: Spacing.one,
  },
  createdAtText: {
    paddingHorizontal: Spacing.one,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
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
    paddingVertical: Spacing.two,
  },
  calendarMonthLabel: {
    textTransform: 'capitalize',
    fontSize: 18,
    fontWeight: '600',
  },
  monthNavButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavText: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  calendarActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  todayButton: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  originDayText: {
    color: '#ffffff',
    fontWeight: '700',
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
    overflow: 'hidden',
  },
});
