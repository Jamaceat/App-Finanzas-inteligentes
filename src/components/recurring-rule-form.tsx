import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { MiniCalendar, startOfToday } from '@/components/mini-calendar';
import { StepHeading, WizardFooter, WizardProgress } from '@/components/wizard-nav';
import {
  CUSTOM_UNIT_OPTIONS,
  FREQUENCY_OPTIONS,
  createdAtFormatter,
  type Rule,
} from '@/components/recurring-rule-shared';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrencyInput } from '@/lib/format';
import {
  createRecurringRule,
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
  getCycleWindow,
  type PendingConfirmation,
} from '@/db/queries/tanks';
import {
  useActiveRules,
  useAllRules,
  useAppSettingsRows,
  useTankTransactions,
} from '@/providers/app-data';

const WIZARD_STEP_COUNT = 6;

// Formulario de reglas recurrentes (Fijo/Variable): kind es fijo por pantalla (prop),
// no hay forma de cambiarlo desde acá. Al crear una regla nueva se muestra por fases
// (un paso por pantalla, con ícono de ayuda); al editar una regla existente se ven
// todos los campos juntos, como antes, porque ahí ya sabés qué estás cambiando.
export function RuleForm({
  kind,
  accentColor,
  editing,
  sections,
  initialVariable,
  simulationOccurrences,
  restrictPastStartDates,
  onDone,
}: {
  kind: RecurringKind;
  accentColor: string;
  editing?: Rule;
  sections: { id: number; name: string }[];
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
  const [step, setStep] = useState(0);
  const [nameError, setNameError] = useState(false);
  const [label, setLabel] = useState(editing?.label ?? '');
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
    const initial = editing?.nextDueDate ?? startOfToday();
    const today = startOfToday();
    return restrictPastStartDates && initial < today ? today : initial;
  });
  const [reminderEnabled, setReminderEnabled] = useState(editing?.reminderEnabled ?? true);

  const formattedAmount = formatCurrencyInput(amountDigits);
  const customValueNumber = Math.max(1, Number(customValue) || 1);
  const isCustomFrequency = frequency === 'custom';

  const originalStartDate = useMemo(() => {
    if (!editing) return undefined;

    const lineageIds = new Set<number>();
    let currId: number | null = editing.id;
    const lineageRules: Rule[] = [];

    while (currId !== null && !lineageIds.has(currId)) {
      lineageIds.add(currId);
      const rule = allRules.find((r) => r.id === currId);
      if (rule) {
        lineageRules.push(rule);
        currId = rule.previousRuleId ?? null;
      } else {
        break;
      }
    }

    const lineageTransactions = transactions.filter(
      (t) => t.recurringRuleId !== null && lineageIds.has(t.recurringRuleId),
    );

    let minDate = new Date(editing.nextDueDate);
    for (const r of lineageRules) {
      const d = new Date(r.nextDueDate);
      if (d < minDate) {
        minDate = d;
      }
    }

    for (const t of lineageTransactions) {
      const occDate = new Date(t.occurredAt);
      if (occDate < minDate) {
        minDate = occDate;
      }
    }

    return minDate;
  }, [editing, allRules, transactions]);

  // Se recalcula con la frecuencia/intervalo elegidos en el form (no los de `editing`):
  // si el usuario cambia mensual -> diaria, el ciclo actual mostrado en el calendario
  // debe reflejar ya la nueva frecuencia, no la que tenía la regla antes de editar.
  const cycleWindow = useMemo(() => {
    if (!editing) return undefined;
    return getCycleWindow({
      ...editing,
      frequency,
      customIntervalValue: isCustomFrequency ? customValueNumber : null,
      customIntervalUnit: isCustomFrequency ? customUnit : null,
    });
  }, [editing, frequency, customValueNumber, customUnit, isCustomFrequency]);

  const calendarEditFocus = appSettingsRows?.[0]?.calendarEditFocus ?? 'origin';
  const [lastInitializedRuleId, setLastInitializedRuleId] = useState<number | null>(null);

  useEffect(() => {
    if (editing && lastInitializedRuleId !== editing.id) {
      if (calendarEditFocus === 'origin' && originalStartDate) {
        const id = setTimeout(() => {
          setStartDate(originalStartDate);
          setLastInitializedRuleId(editing.id);
        }, 0);
        return () => clearTimeout(id);
      } else if (calendarEditFocus === 'current' && cycleWindow?.start) {
        const id = setTimeout(() => {
          setStartDate(cycleWindow.start);
          setLastInitializedRuleId(editing.id);
        }, 0);
        return () => clearTimeout(id);
      }
    } else if (!editing && lastInitializedRuleId !== null) {
      const id = setTimeout(() => {
        setLastInitializedRuleId(null);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [editing, originalStartDate, cycleWindow, calendarEditFocus, lastInitializedRuleId]);

  const simulationStartDate = editing && cycleWindow?.start ? cycleWindow.start : startDate;

  // Memoizado: sin esto se re-simulan todas las ocurrencias (y se re-renderiza
  // el MiniCalendar con array nuevo) en cada tecleo del formulario.
  const upcomingDates = useMemo(
    () => simulateOccurrences(simulationStartDate, frequency, customValueNumber, customUnit, simulationOccurrences),
    [simulationStartDate, frequency, customValueNumber, customUnit, simulationOccurrences],
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
      setNameError(true);
      setStep(0);
      return;
    }

    const estimatedAmount = isVariableAmount
      ? null
      : amountDigits
        ? Number(amountDigits) / 100
        : null;

    const resolvedSectionId = sectionId ?? (await getOrCreateDefaultSection()).id;

    let created;
    if (editing) {
      const hasChangedStartDate = startDate.getTime() !== editing.nextDueDate.getTime();
      const nextDueDateToSave = hasChangedStartDate ? startDate : editing.nextDueDate;

      // Desactivar regla anterior (preserva el historial) y crear la nueva versión,
      // en una sola transacción/commit.
      created = await replaceRecurringRule(editing.id, {
        sectionId: resolvedSectionId,
        label: trimmedLabel,
        kind,
        frequency,
        customIntervalValue: isCustomFrequency ? customValueNumber : null,
        customIntervalUnit: isCustomFrequency ? customUnit : null,
        isVariableAmount,
        estimatedAmount: estimatedAmount ?? undefined,
        nextDueDate: nextDueDateToSave,
        reminderEnabled,
      });
    } else {
      [created] = await createRecurringRule({
        sectionId: resolvedSectionId,
        label: trimmedLabel,
        kind,
        frequency,
        customIntervalValue: isCustomFrequency ? customValueNumber : null,
        customIntervalUnit: isCustomFrequency ? customUnit : null,
        isVariableAmount,
        estimatedAmount: estimatedAmount ?? undefined,
        nextDueDate: startDate,
        reminderEnabled,
      });
      setLabel('');
      setAmountDigits('');
      setStartDate(startOfToday());
      setStep(0);
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

  function handleWizardNext() {
    if (step === 0 && !label.trim()) {
      setNameError(true);
      return;
    }
    if (step === WIZARD_STEP_COUNT - 1) {
      handleSubmit();
      return;
    }
    setStep((value) => value + 1);
  }

  function handleWizardBack() {
    setStep((value) => Math.max(0, value - 1));
  }

  function renderNameField() {
    return (
      <TextInput
        value={label}
        onChangeText={(text) => {
          setLabel(text);
          setNameError(false);
        }}
        placeholder="Nombre (ej. Alquiler, Sueldo)"
        placeholderTextColor={theme.textSecondary}
        autoFocus={!editing}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />
    );
  }

  function renderFrequencyField() {
    return (
      <>
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
      </>
    );
  }

  function renderAmountField() {
    return (
      <>
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
      </>
    );
  }

  function renderSectionField() {
    return sections.length > 0 ? (
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
    ) : (
      <ThemedText type="small" themeColor="textSecondary">
        Todavía no creaste secciones: se va a usar &ldquo;General&rdquo; automáticamente.
      </ThemedText>
    );
  }

  function renderReminderField() {
    return (
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
    );
  }

  function renderCalendarField() {
    return (
      <>
        <View style={styles.calendarLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendCircle, { backgroundColor: theme.backgroundSelected, borderWidth: 1, borderColor: theme.backgroundSelected }]} />
            <ThemedText type="small" themeColor="textSecondary">Inicio</ThemedText>
          </View>
          {editing && (
            <View style={styles.legendItem}>
              <View style={[styles.legendCircle, { borderWidth: 2, borderColor: '#0091FF', backgroundColor: theme.backgroundRecurringFixed }]} />
              <ThemedText type="small" themeColor="textSecondary">Ciclo actual</ThemedText>
            </View>
          )}
          <View style={styles.legendItem}>
            <View style={[styles.legendCircle, { borderWidth: 1.5, borderColor: accentColor, backgroundColor: 'transparent' }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {kind === 'income' ? 'Ingresos' : 'Gastos'}
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#0091FF' }]} />
            <ThemedText type="small" themeColor="textSecondary">Hoy</ThemedText>
          </View>
        </View>

        <MiniCalendar
          value={startDate}
          onChange={setStartDate}
          highlightDates={upcomingDates}
          highlightColor={accentColor}
          minDate={restrictPastStartDates ? startOfToday() : undefined}
          cycleStart={cycleWindow?.start}
          cycleEnd={cycleWindow?.end}
          originalStartDate={originalStartDate}
        />
      </>
    );
  }

  // Editar una regla existente: se ven todos los campos juntos, como antes — ya sabés
  // qué estás cambiando, no hace falta guiarte paso a paso.
  if (editing) {
    return (
      <View style={styles.formWrapper}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.createdAtText}>
          Creada el {createdAtFormatter.format(editing.createdAt)}
        </ThemedText>
        <ThemedView type="backgroundElement" style={[styles.form, { borderColor: accentColor }]}>
          {renderNameField()}
          {renderFrequencyField()}
          {renderAmountField()}
          {renderSectionField()}
          {renderReminderField()}
          <ThemedText type="small" themeColor="textSecondary">
            Punto de partida
          </ThemedText>
          {renderCalendarField()}

          <View style={styles.formActions}>
            <Pressable onPress={onDone} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="background" style={styles.submitButton}>
                <ThemedText type="smallBold">Cancelar</ThemedText>
              </ThemedView>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={({ pressed }) => [styles.submitFlex, pressed && styles.pressed]}>
              <View style={[styles.submitButton, { backgroundColor: accentColor }]}>
                <ThemedText type="smallBold" style={styles.submitLabel}>
                  Guardar
                </ThemedText>
              </View>
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
            cancelLabel="Continuar sin confirmar"
            onClose={() => {
              setPendingBackfill(null);
              onDone();
            }}
          />
        )}
      </View>
    );
  }

  // Crear una regla nueva: por fases, un paso por pantalla.
  const wizardSteps: { title: string; info: string; content: () => React.ReactNode }[] = [
    {
      title: 'Nombre',
      info: 'Elegí un nombre corto para identificar este movimiento, por ejemplo "Alquiler" o "Sueldo".',
      content: renderNameField,
    },
    {
      title: '¿Cada cuánto?',
      info: 'Elegí con qué frecuencia se repite este movimiento.',
      content: renderFrequencyField,
    },
    {
      title: '¿Cuánto?',
      info: 'Fijo: siempre el mismo monto. Variable: cambia cada vez y lo vas a cargar al confirmarlo.',
      content: renderAmountField,
    },
    {
      title: 'Sección',
      info: 'Agrupá este movimiento dentro de una sección para organizar tus finanzas.',
      content: renderSectionField,
    },
    {
      title: 'Recordatorio',
      info: 'Elegí si querés que la app te avise cuando se acerque la fecha.',
      content: renderReminderField,
    },
    {
      title: 'Fecha de inicio',
      info: 'Elegí desde cuándo empieza a repetirse. Se muestran las próximas fechas simuladas en el calendario.',
      content: renderCalendarField,
    },
  ];

  const currentStep = wizardSteps[step];
  const isLastStep = step === WIZARD_STEP_COUNT - 1;

  return (
    <View style={styles.formWrapper}>
      <ThemedView type="backgroundElement" style={[styles.form, { borderColor: accentColor }]}>
        <WizardProgress step={step} total={WIZARD_STEP_COUNT} accentColor={accentColor} />

        <StepHeading title={currentStep.title} info={currentStep.info} accentColor={accentColor} />
        {currentStep.content()}
        {step === 0 && nameError && (
          <ThemedText type="small" style={{ color: accentColor }}>
            Ingresá un nombre.
          </ThemedText>
        )}

        <WizardFooter
          accentColor={accentColor}
          showBack={step > 0}
          onBack={handleWizardBack}
          onNext={handleWizardNext}
          nextLabel={isLastStep ? (kind === 'income' ? 'Crear ingreso' : 'Crear gasto') : 'Siguiente'}
        />
      </ThemedView>

      {pendingBackfill && (
        <ConfirmationModal
          confirmation={pendingBackfill}
          incomeTanks={incomeTanks}
          specialTanks={specialTanks}
          freeCashTank={freeCashTank}
          transactions={transactions}
          allRules={allRules}
          cancelLabel="Continuar sin confirmar"
          onClose={() => {
            setPendingBackfill(null);
            onDone();
          }}
        />
      )}
    </View>
  );
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

export function Chip({
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
    borderWidth: 1.5,
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
  submitLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  calendarLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  legendCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
});
