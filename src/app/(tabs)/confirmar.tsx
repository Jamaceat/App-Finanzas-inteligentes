import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmRecurringOccurrences, type TransactionKind } from '@/db/queries/transactions';
import { useActiveRules, useActiveSections, useTankTransactions } from '@/providers/app-data';
import {
  computeIncomeTanks,
  computePendingConfirmations,
  type IncomeTank,
  type PendingConfirmation,
} from '@/db/queries/tanks';

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

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function findRememberedTankId(
  ruleId: number,
  transactions: { recurringRuleId: number | null; allocatedIncomeRuleId: number | null; occurredAt: Date }[],
): number | null {
  const matches = transactions
    .filter((t) => t.recurringRuleId === ruleId && t.allocatedIncomeRuleId !== null)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return matches[0]?.allocatedIncomeRuleId ?? null;
}

export default function ConfirmarScreen() {
  const [kind, setKind] = useState<TransactionKind>('income');
  const rules = useActiveRules();
  const transactions = useTankTransactions();
  const sections = useActiveSections();

  const [activeConfirmation, setActiveConfirmation] = useState<PendingConfirmation | null>(null);

  const pendingConfirmations = useMemo(
    () => computePendingConfirmations(rules, kind),
    [rules, kind],
  );
  const incomeTanks = useMemo(() => computeIncomeTanks(rules, transactions), [rules, transactions]);
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Confirmar
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Hacé efectivos los ciclos pendientes de tus recurrentes.
          </ThemedText>

          <View style={styles.kindRow}>
            <Pressable style={styles.kindButton} onPress={() => setKind('income')}>
              <ThemedView
                type={kind === 'income' ? 'backgroundSelected' : 'background'}
                style={styles.kindButtonInner}>
                <ThemedText type="small">Ingresos</ThemedText>
              </ThemedView>
            </Pressable>
            <Pressable style={styles.kindButton} onPress={() => setKind('expense')}>
              <ThemedView
                type={kind === 'expense' ? 'backgroundSelected' : 'background'}
                style={styles.kindButtonInner}>
                <ThemedText type="small">Gastos</ThemedText>
              </ThemedView>
            </Pressable>
          </View>

          {pendingConfirmations.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No hay {kind === 'income' ? 'ingresos' : 'gastos'} pendientes de confirmar.
            </ThemedText>
          )}

          {pendingConfirmations.map((confirmation) => {
            const section = sectionById.get(confirmation.sectionId);
            const count = confirmation.occurrences.length;
            return (
              <ThemedView key={confirmation.ruleId} type="backgroundElement" style={styles.card}>
                <View style={styles.cardMain}>
                  <ThemedText type="smallBold">{confirmation.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {section?.name ?? 'Sección'} · {count} ciclo{count === 1 ? '' : 's'} pendiente
                    {count === 1 ? '' : 's'}
                  </ThemedText>
                  <ThemedView type="backgroundSelected" style={styles.badge}>
                    <ThemedText type="small">
                      {confirmation.isVariableAmount ? 'Variable' : 'Fijo'}
                    </ThemedText>
                  </ThemedView>
                </View>
                <Pressable
                  onPress={() => setActiveConfirmation(confirmation)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundSelected" style={styles.confirmButton}>
                    <ThemedText type="smallBold">Confirmar</ThemedText>
                  </ThemedView>
                </Pressable>
              </ThemedView>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {activeConfirmation && (
        <ConfirmationModal
          confirmation={activeConfirmation}
          incomeTanks={incomeTanks}
          transactions={transactions}
          onClose={() => setActiveConfirmation(null)}
        />
      )}
    </ThemedView>
  );
}

type OccurrenceRow = {
  date: Date;
  checked: boolean;
  amountDigits: string;
};

function ConfirmationModal({
  confirmation,
  incomeTanks,
  transactions,
  onClose,
}: {
  confirmation: PendingConfirmation;
  incomeTanks: IncomeTank[];
  transactions: { recurringRuleId: number | null; allocatedIncomeRuleId: number | null; occurredAt: Date }[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const isExpense = confirmation.kind === 'expense';
  const rememberedTankId = useMemo(
    () =>
      isExpense
        ? (confirmation.plannedTankRuleId ?? findRememberedTankId(confirmation.ruleId, transactions))
        : null,
    [isExpense, confirmation.plannedTankRuleId, confirmation.ruleId, transactions],
  );
  const needsTankChoice = isExpense && rememberedTankId === null;

  const [rows, setRows] = useState<OccurrenceRow[]>(() =>
    confirmation.occurrences.map((date) => ({
      date,
      checked: true,
      amountDigits: confirmation.isVariableAmount
        ? ''
        : String(Math.round((confirmation.estimatedAmount ?? 0) * 100)),
    })),
  );
  const [selectedTankId, setSelectedTankId] = useState<number | null>(rememberedTankId);
  const [submitting, setSubmitting] = useState(false);

  function toggleRow(index: number) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, checked: !row.checked } : row)));
  }

  function setRowAmount(index: number, digits: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, amountDigits: digits } : row)));
  }

  function selectAll() {
    setRows((prev) => prev.map((row) => ({ ...row, checked: true })));
  }

  function deselectAll() {
    setRows((prev) => prev.map((row) => ({ ...row, checked: false })));
  }

  const checkedRows = rows.filter((row) => row.checked);
  const hasCheckedRows = checkedRows.length > 0;
  const allAmountsValid = checkedRows.every((row) => Number(row.amountDigits || '0') > 0);
  const tankResolved = !needsTankChoice || selectedTankId !== null;
  const canConfirm = hasCheckedRows && allAmountsValid && tankResolved && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await confirmRecurringOccurrences({
        ruleId: confirmation.ruleId,
        sectionId: confirmation.sectionId,
        kind: confirmation.kind,
        description: confirmation.label,
        allocatedIncomeRuleId: isExpense ? rememberedTankId ?? selectedTankId : undefined,
        occurrences: checkedRows.map((row) => ({
          occurredAt: row.date,
          amount: Number(row.amountDigits || '0') / 100,
        })),
        nextDueDate: confirmation.nextDueAfter,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const kindLabel = isExpense ? 'gastos' : 'ingresos';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ThemedView type="backgroundElement" style={styles.modalCard}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled">
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Vas a hacer efectivos {rows.length} {kindLabel} pendientes de {confirmation.label}
            </ThemedText>

            <View style={styles.selectRow}>
              <Pressable onPress={selectAll} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="link">Seleccionar todos</ThemedText>
              </Pressable>
              <Pressable onPress={deselectAll} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="link">Deseleccionar todos</ThemedText>
              </Pressable>
            </View>

            {rows.map((row, index) => (
              <View key={row.date.getTime()} style={styles.occurrenceRow}>
                <Pressable
                  onPress={() => toggleRow(index)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type={row.checked ? 'backgroundSelected' : 'background'}
                    style={styles.checkbox}>
                    {row.checked && <ThemedText type="smallBold">✓</ThemedText>}
                  </ThemedView>
                </Pressable>
                <ThemedText type="small" style={styles.occurrenceDate}>
                  {formatDate(row.date)}
                </ThemedText>
                <TextInput
                  value={formatCurrencyInput(row.amountDigits)}
                  onChangeText={(text) =>
                    setRowAmount(index, text.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))
                  }
                  editable={row.checked}
                  keyboardType="number-pad"
                  style={[
                    styles.amountInput,
                    { color: theme.text, backgroundColor: theme.background, opacity: row.checked ? 1 : 0.4 },
                  ]}
                />
              </View>
            ))}

            {needsTankChoice && (
              <View style={styles.tankSection}>
                <ThemedText type="small" themeColor="textSecondary">
                  Elegí de qué tanque sale este gasto:
                </ThemedText>
                <View style={styles.chipRow}>
                  {incomeTanks.map((tank) => (
                    <Pressable
                      key={tank.ruleId}
                      onPress={() => setSelectedTankId(tank.ruleId)}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <ThemedView
                        type={selectedTankId === tank.ruleId ? 'backgroundSelected' : 'background'}
                        style={styles.chip}>
                        <ThemedText type="small">{tank.label}</ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
                {incomeTanks.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    No hay tanques de ingreso disponibles.
                  </ThemedText>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="background" style={styles.modalButton}>
                  <ThemedText type="small">Cancelar</ThemedText>
                </ThemedView>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={!canConfirm}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView
                  type="backgroundSelected"
                  style={[styles.modalButton, !canConfirm && styles.disabledButton]}>
                  <ThemedText type="smallBold">Confirmar</ThemedText>
                </ThemedView>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
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
  subtitle: {
    paddingBottom: Spacing.one,
  },
  kindRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kindButton: {
    flex: 1,
  },
  kindButtonInner: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  emptyText: {
    paddingTop: Spacing.four,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  cardMain: {
    gap: Spacing.half,
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    marginTop: Spacing.half,
  },
  confirmButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
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
  selectRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  occurrenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  occurrenceDate: {
    flex: 1,
  },
  amountInput: {
    minWidth: 120,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    fontSize: 15,
    textAlign: 'right',
  },
  tankSection: {
    gap: Spacing.two,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
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
