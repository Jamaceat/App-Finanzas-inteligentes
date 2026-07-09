import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { SPECIAL_TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import { confirmRecurringOccurrences, type TransactionKind } from '@/db/queries/transactions';
import { createSpecialTank, updateSpecialTank } from '@/db/queries/recurring-rules';
import {
  useActiveRules,
  useActiveSections,
  useAppSettingsRows,
  useTankTransactions,
} from '@/providers/app-data';
import {
  addInterval,
  computeFreeCashTank,
  computeIncomeTanks,
  computePendingConfirmations,
  computeSpecialTanks,
  type FreeCashTank,
  type IncomeTank,
  type PendingConfirmation,
  type SpecialTank,
} from '@/db/queries/tanks';

// Sentinel para el chip "Tanque especial (Libre)" en el picker de tanques del modal:
// nunca colisiona con un ruleId real (autoincremental, siempre positivo).
const SPECIAL_TANK_SENTINEL_ID = -1;

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
  const settingsRows = useAppSettingsRows();

  const [activeConfirmation, setActiveConfirmation] = useState<PendingConfirmation | null>(null);

  const pendingConfirmations = useMemo(
    () => computePendingConfirmations(rules, kind),
    [rules, kind],
  );
  const incomeTanks = useMemo(() => computeIncomeTanks(rules, transactions), [rules, transactions]);
  const specialTanks = useMemo(() => computeSpecialTanks(rules, transactions), [rules, transactions]);
  const freeCashTank = useMemo(() => {
    const tankMaxRenewalValue = settingsRows?.[0]?.tankMaxRenewalValue ?? 30;
    const tankMaxRenewalUnit = settingsRows?.[0]?.tankMaxRenewalUnit ?? 'days';
    const windowStart = addInterval(new Date(), -tankMaxRenewalValue, tankMaxRenewalUnit);
    return computeFreeCashTank(rules, transactions, windowStart);
  }, [rules, transactions, settingsRows]);
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
          specialTanks={specialTanks}
          freeCashTank={freeCashTank}
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
  specialTanks,
  freeCashTank,
  transactions,
  onClose,
}: {
  confirmation: PendingConfirmation;
  incomeTanks: IncomeTank[];
  specialTanks: SpecialTank[];
  freeCashTank: FreeCashTank;
  transactions: { recurringRuleId: number | null; allocatedIncomeRuleId: number | null; occurredAt: Date }[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const isExpense = confirmation.kind === 'expense';
  // El tanque especial temporal ya definido para ESTE gasto (si lo hay): se buscó
  // vía asignar-gastos, o se creó en una confirmación anterior de este mismo ciclo.
  const ownSpecialTank = useMemo(
    () => specialTanks.find((tank) => tank.expenseRuleId === confirmation.ruleId) ?? null,
    [specialTanks, confirmation.ruleId],
  );
  const rememberedTankId = useMemo(() => {
    if (!isExpense) return null;
    const rawId = confirmation.plannedTankRuleId ?? findRememberedTankId(confirmation.ruleId, transactions);
    const isActive =
      incomeTanks.some((tank) => tank.ruleId === rawId) || ownSpecialTank?.ruleId === rawId;
    return isActive ? rawId : null;
  }, [isExpense, confirmation.plannedTankRuleId, confirmation.ruleId, transactions, incomeTanks, ownSpecialTank]);
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

  const checkedRows = rows.filter((row) => row.checked);
  const totalAmount = useMemo(() => {
    return checkedRows.reduce(
      (sum, row) => sum + Number(row.amountDigits || '0') / 100,
      0,
    );
  }, [checkedRows]);

  // Cuánto se podría cubrir eligiendo "Tanque especial (Libre)": lo ya reservado
  // para este gasto (si ya existía un tanque especial propio) más lo que quede
  // libre en Libre ahora mismo (freeCashTank.level ya excluye esa reserva propia).
  const specialTankAvailable = (ownSpecialTank?.capacity ?? 0) + freeCashTank.level;
  const canUseSpecialTank = specialTankAvailable > 0;

  const activeTankId = isExpense ? selectedTankId : null;
  const selectedTank = useMemo(() => {
    if (activeTankId === null) return null;
    if (activeTankId === SPECIAL_TANK_SENTINEL_ID) {
      return {
        ruleId: SPECIAL_TANK_SENTINEL_ID,
        sectionId: confirmation.sectionId,
        label: 'Tanque especial (Libre)',
        capacity: specialTankAvailable,
        level: specialTankAvailable,
      };
    }
    return (
      incomeTanks.find((tank) => tank.ruleId === activeTankId) ??
      (ownSpecialTank && ownSpecialTank.ruleId === activeTankId
        ? {
            ruleId: ownSpecialTank.ruleId,
            sectionId: ownSpecialTank.sectionId,
            label: ownSpecialTank.label,
            capacity: ownSpecialTank.capacity,
            level: ownSpecialTank.level,
          }
        : null)
    );
  }, [activeTankId, incomeTanks, ownSpecialTank, specialTankAvailable, confirmation.sectionId]);

  const hasEnoughFunds = !isExpense || selectedTank === null || selectedTank.level >= totalAmount;
  const isSpecialTankSelected =
    selectedTankId === SPECIAL_TANK_SENTINEL_ID || (ownSpecialTank !== null && selectedTankId === ownSpecialTank.ruleId);

  function selectAll() {
    setRows((prev) => prev.map((row) => ({ ...row, checked: true })));
  }

  function deselectAll() {
    setRows((prev) => prev.map((row) => ({ ...row, checked: false })));
  }

  const hasCheckedRows = checkedRows.length > 0;
  const allAmountsValid = checkedRows.every((row) => Number(row.amountDigits || '0') > 0);
  const tankResolved = !needsTankChoice || selectedTankId !== null;
  const canConfirm = hasCheckedRows && allAmountsValid && tankResolved && hasEnoughFunds && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      let allocatedIncomeRuleId: number | null | undefined = isExpense ? selectedTankId : undefined;
      let isSpecialTank = false;

      if (isExpense && selectedTankId === SPECIAL_TANK_SENTINEL_ID) {
        // "Pagar todos los ciclos hasta el presente con Libre": si el gasto ya tenía
        // un tanque especial propio se le sube la capacidad, si no se crea uno nuevo.
        // El vencimiento se sincroniza con el próximo cobro real (nextDueAfter), que
        // es exactamente cuándo debe desaparecer este tanque (ver schema.ts).
        if (ownSpecialTank) {
          const [tank] = await updateSpecialTank(ownSpecialTank.ruleId, {
            capacity: Math.max(ownSpecialTank.capacity, totalAmount),
            expiresAt: confirmation.nextDueAfter,
          });
          allocatedIncomeRuleId = tank.id;
        } else {
          const [tank] = await createSpecialTank({
            sectionId: confirmation.sectionId,
            expenseRuleId: confirmation.ruleId,
            capacity: totalAmount,
            expiresAt: confirmation.nextDueAfter,
          });
          allocatedIncomeRuleId = tank.id;
        }
        isSpecialTank = true;
      } else if (isExpense && ownSpecialTank && selectedTankId === ownSpecialTank.ruleId) {
        isSpecialTank = true;
      }

      await confirmRecurringOccurrences({
        ruleId: confirmation.ruleId,
        sectionId: confirmation.sectionId,
        kind: confirmation.kind,
        description: confirmation.label,
        allocatedIncomeRuleId,
        occurrences: checkedRows.map((row) => ({
          occurredAt: row.date,
          amount: Number(row.amountDigits || '0') / 100,
        })),
        nextDueDate: confirmation.nextDueAfter,
        isSpecialTank,
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

            {isExpense && selectedTank && (
              <View style={styles.tankInfoBox}>
                <ThemedText type="small" themeColor="textSecondary">
                  Se pagará del tanque:{' '}
                  <ThemedText
                    type="smallBold"
                    style={isSpecialTankSelected ? { color: SPECIAL_TANK_COLOR } : undefined}>
                    {`${selectedTank.label} (${currencyFormatter.format(selectedTank.level)} disponible)`}
                  </ThemedText>
                </ThemedText>
              </View>
            )}

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
                        <ThemedText type="small">
                          {`${tank.label} (${currencyFormatter.format(tank.level)})`}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                  {/* Siempre se ofrece: paga con dinero Libre vía un tanque especial
                      temporal cuando ningún tanque real alcanza. */}
                  <Pressable
                    disabled={!canUseSpecialTank}
                    onPress={() => setSelectedTankId(SPECIAL_TANK_SENTINEL_ID)}
                    style={({ pressed }) => [
                      (pressed && canUseSpecialTank) && styles.pressed,
                      !canUseSpecialTank && styles.disabledButton,
                    ]}>
                    <View
                      style={[
                        styles.chip,
                        styles.specialChip,
                        {
                          backgroundColor:
                            selectedTankId === SPECIAL_TANK_SENTINEL_ID
                              ? SPECIAL_TANK_COLOR
                              : SPECIAL_TANK_COLOR + '1F',
                        },
                      ]}>
                      <ThemedText
                        type="small"
                        style={selectedTankId === SPECIAL_TANK_SENTINEL_ID ? styles.specialChipTextSelected : { color: SPECIAL_TANK_COLOR }}>
                        {`Tanque especial (Libre: ${currencyFormatter.format(specialTankAvailable)})`}
                      </ThemedText>
                    </View>
                  </Pressable>
                </View>
                {incomeTanks.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    No hay tanques de ingreso disponibles.
                  </ThemedText>
                )}
              </View>
            )}

            {isExpense && selectedTank && selectedTank.level < totalAmount && (
              <>
                <ThemedText type="small" style={styles.errorText}>
                  No hay fondos suficientes para aceptar este gasto en {selectedTank.label} ({currencyFormatter.format(selectedTank.level)} disponibles).
                </ThemedText>
                {!needsTankChoice && selectedTankId !== SPECIAL_TANK_SENTINEL_ID && (
                  canUseSpecialTank ? (
                    <Pressable
                      onPress={() => setSelectedTankId(SPECIAL_TANK_SENTINEL_ID)}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <View style={[styles.chip, styles.specialChip, { backgroundColor: SPECIAL_TANK_COLOR + '1F', alignSelf: 'flex-start' }]}>
                        <ThemedText type="small" style={{ color: SPECIAL_TANK_COLOR }}>
                          {`Pagar con tanque especial (Libre: ${currencyFormatter.format(specialTankAvailable)})`}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ) : (
                    <ThemedText type="small" style={styles.errorText}>
                      Tampoco hay fondos suficientes en Libre.
                    </ThemedText>
                  )
                )}
              </>
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
  specialChip: {
    marginTop: Spacing.one,
  },
  specialChipTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
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
  tankInfoBox: {
    marginTop: Spacing.one,
  },
  errorText: {
    color: '#E5484D',
    marginTop: Spacing.two,
    fontWeight: '600',
  },
});
