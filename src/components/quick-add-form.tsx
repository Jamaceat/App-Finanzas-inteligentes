import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FilterChip } from '@/components/filter-chip';
import { TankSearchModal, type SearchTankItem } from '@/components/tank-search-modal';
import { StepHeading, WizardFooter, WizardProgress } from '@/components/wizard-nav';
import { Spacing } from '@/constants/theme';
import { FREE_TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrencyInput } from '@/lib/format';
import { createTransaction, type TransactionKind } from '@/db/queries/transactions';
import { getOrCreateDefaultSection } from '@/db/queries/sections';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

const SUCCESS_BANNER_DURATION_MS = 1600;

// Formulario de alta inmediata ("Ahora"): kind es fijo por pantalla (prop, no state) —
// así se evita el error de tocar un chip y anotar un ingreso como gasto (o viceversa).
// Se muestra por fases (un paso por pantalla) en vez de todos los campos juntos.
export function QuickAddForm({
  kind,
  accentColor,
  sections,
  tanks,
}: {
  kind: TransactionKind;
  accentColor: string;
  sections: { id: number; name: string }[];
  tanks: SearchTankItem[];
}) {
  const theme = useTheme();
  const isExpense = kind === 'expense';
  const [step, setStep] = useState(0);
  const [amountDigits, setAmountDigits] = useState('');
  const [description, setDescription] = useState('');
  const [sectionId, setSectionId] = useState<number | undefined>(undefined);
  const [selectedTank, setSelectedTank] = useState<SearchTankItem | null>(null);
  const [tankModalVisible, setTankModalVisible] = useState(false);
  const [tankSearchQuery, setTankSearchQuery] = useState('');
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const parsedAmount = Number(amountDigits || '0') / 100;
  const formattedAmount = formatCurrencyInput(amountDigits);
  const totalSteps = isExpense ? 4 : 3;
  const isLastStep = step === totalSteps - 1;

  useEffect(() => {
    if (!showSuccess) return;
    const id = setTimeout(() => setShowSuccess(false), SUCCESS_BANNER_DURATION_MS);
    return () => clearTimeout(id);
  }, [showSuccess]);

  function handleAmountChange(text: string) {
    const digitsOnly = text.replace(/\D/g, '');
    setAmountDigits(digitsOnly.replace(/^0+(?=\d)/, ''));
    setShowError(false);
  }

  async function handleSubmit() {
    const resolvedSectionId = sectionId ?? (await getOrCreateDefaultSection()).id;

    await createTransaction({
      sectionId: resolvedSectionId,
      amount: parsedAmount,
      kind,
      description: description.trim() || undefined,
      occurredAt: new Date(),
      allocatedIncomeRuleId: isExpense ? selectedTank?.ruleId : undefined,
    });

    setAmountDigits('');
    setDescription('');
    setSelectedTank(null);
    setStep(0);
    setShowSuccess(true);
  }

  function handleNext() {
    if (step === 0 && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setShowError(true);
      return;
    }
    if (isLastStep) {
      handleSubmit();
      return;
    }
    setStep((value) => value + 1);
  }

  function handleBack() {
    setStep((value) => Math.max(0, value - 1));
  }

  const nextLabel = isLastStep
    ? isExpense
      ? 'Registrar gasto'
      : 'Registrar ingreso'
    : 'Siguiente';

  function renderStepContent() {
    if (step === 0) {
      return (
        <>
          <StepHeading title="¿Cuánto?" info="Ingresá el monto exacto de este movimiento." accentColor={accentColor} />
          <TextInput
            value={formattedAmount}
            onChangeText={handleAmountChange}
            placeholder="$ 0,00"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            autoFocus
            style={[styles.amountInput, { color: accentColor, backgroundColor: theme.background }]}
          />
          {showError && (
            <ThemedText type="small" style={{ color: accentColor }}>
              Ingresá un monto mayor a $0.
            </ThemedText>
          )}
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <StepHeading
            title="Descripción"
            info="Opcional: una nota corta para identificar este movimiento más adelante."
            accentColor={accentColor}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Descripción (opcional)"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          />
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <StepHeading
            title="Sección"
            info="Agrupá este movimiento dentro de una sección para organizar tus finanzas."
            accentColor={accentColor}
          />
          {sections.length > 0 ? (
            <View style={styles.chipRow}>
              <FilterChip
                label="Sin sección"
                selected={sectionId === undefined}
                onPress={() => setSectionId(undefined)}
              />
              {sections.map((section) => (
                <FilterChip
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
          )}
        </>
      );
    }

    return (
      <>
        <StepHeading
          title="¿De dónde sale?"
          info="Elegí el tanque de ingresos del que sale este gasto, o dejalo en Libre."
          accentColor={accentColor}
        />
        <Pressable
          onPress={() => setTankModalVisible(true)}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="background" style={styles.tankPicker}>
            <View
              style={[
                styles.tankPickerDot,
                { backgroundColor: selectedTank?.color ?? FREE_TANK_COLOR },
              ]}
            />
            <ThemedText type="small" style={styles.tankPickerLabel}>
              {selectedTank ? `Sale de: ${selectedTank.label}` : 'Sale de: Libre'}
            </ThemedText>
            <SymbolView
              name={symbol('chevron.right', 'chevron_right')}
              tintColor={theme.textSecondary}
              size={14}
            />
          </ThemedView>
        </Pressable>
      </>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.form, { borderColor: accentColor }]}>
      <WizardProgress step={step} total={totalSteps} accentColor={accentColor} />

      {renderStepContent()}

      <WizardFooter
        accentColor={accentColor}
        showBack={step > 0}
        onBack={handleBack}
        onNext={handleNext}
        nextLabel={nextLabel}
      />

      {showSuccess && (
        <View style={[styles.successBanner, { backgroundColor: accentColor }]}>
          <SymbolView name={symbol('checkmark.circle.fill', 'check_circle')} tintColor="#ffffff" size={16} />
          <ThemedText type="small" style={styles.successLabel}>
            {isExpense ? 'Gasto registrado' : 'Ingreso registrado'}
          </ThemedText>
        </View>
      )}

      <TankSearchModal
        visible={tankModalVisible}
        onClose={() => setTankModalVisible(false)}
        tanks={tanks}
        searchQuery={tankSearchQuery}
        onSearchQueryChange={setTankSearchQuery}
        onSelectTank={(tank) => {
          setSelectedTank(tank.ruleId === undefined ? null : tank);
          setTankModalVisible(false);
          setTankSearchQuery('');
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1.5,
  },
  amountInput: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tankPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  tankPickerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tankPickerLabel: {
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  successLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});
