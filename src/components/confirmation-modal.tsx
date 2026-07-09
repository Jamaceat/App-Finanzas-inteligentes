import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { SPECIAL_TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import { confirmRecurringOccurrences } from '@/db/queries/transactions';
import { createSpecialTank, updateSpecialTank } from '@/db/queries/recurring-rules';
import {
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

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

type OccurrenceRow = {
  date: Date;
  checked: boolean;
  amountDigits: string;
};

export function ConfirmationModal({
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

  const [rows, setRows] = useState<OccurrenceRow[]>(() => {
    const today = new Date();
    return confirmation.occurrences.map((date) => ({
      date,
      // El ciclo de hoy todavía no terminó (termina recién con el próximo
      // vencimiento), así que no se da por recibido/pagado automáticamente: el
      // usuario lo tilda a mano cuando efectivamente ocurra.
      checked: !isSameCalendarDay(date, today),
      amountDigits: confirmation.isVariableAmount
        ? ''
        : String(Math.round((confirmation.estimatedAmount ?? 0) * 100)),
    }));
  });
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
  const fundsOk = checkedRows.length === 0 || hasEnoughFunds;
  const tankOk = checkedRows.length === 0 || tankResolved;
  const canConfirm = hasCheckedRows && allAmountsValid && tankResolved && hasEnoughFunds && !submitting;

  // Si queda algún ciclo sin tildar (p.ej. el de hoy, que todavía no terminó), la
  // regla no puede saltar hasta nextDueAfter: eso lo daría por vencido/perdido sin
  // haberse confirmado. En cambio, el próximo vencimiento queda en la fecha del
  // primer ciclo pendiente sin tildar, así sigue apareciendo para confirmar más
  // adelante y el tanque no lo cuenta como si ya hubiera pasado.
  const firstUnconfirmedRow = rows.find((row) => !row.checked);
  const effectiveNextDueDate = firstUnconfirmedRow ? firstUnconfirmedRow.date : confirmation.nextDueAfter;

  // "Descartar": para cuando lo sin tildar nunca va a pasar (p.ej. días de prueba de
  // un cambio de frecuencia retroactivo) y quedarían bloqueando el tanque para
  // siempre — a diferencia de Confirmar, acá el vencimiento salta directo a
  // nextDueAfter aunque queden filas sin tildar, así no vuelven a preguntarse.
  const canDiscard = allAmountsValid && tankOk && fundsOk && !submitting;

  async function submit(nextDueDate: Date) {
    setSubmitting(true);
    try {
      let allocatedIncomeRuleId: number | null | undefined = isExpense ? selectedTankId : undefined;
      let isSpecialTank = false;

      if (checkedRows.length > 0 && isExpense && selectedTankId === SPECIAL_TANK_SENTINEL_ID) {
        // "Pagar todos los ciclos hasta el presente con Libre": si el gasto ya tenía
        // un tanque especial propio se le sube la capacidad, si no se crea uno nuevo.
        // El vencimiento se sincroniza con el próximo cobro real, que es cuándo debe
        // desaparecer este tanque (ver schema.ts).
        if (ownSpecialTank) {
          const [tank] = await updateSpecialTank(ownSpecialTank.ruleId, {
            capacity: Math.max(ownSpecialTank.capacity, totalAmount),
            expiresAt: nextDueDate,
          });
          allocatedIncomeRuleId = tank.id;
        } else {
          const [tank] = await createSpecialTank({
            sectionId: confirmation.sectionId,
            expenseRuleId: confirmation.ruleId,
            capacity: totalAmount,
            expiresAt: nextDueDate,
          });
          allocatedIncomeRuleId = tank.id;
        }
        isSpecialTank = true;
      } else if (checkedRows.length > 0 && isExpense && ownSpecialTank && selectedTankId === ownSpecialTank.ruleId) {
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
        nextDueDate,
        isSpecialTank,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    await submit(effectiveNextDueDate);
  }

  async function handleDiscardRest() {
    if (!canDiscard) return;
    await submit(confirmation.nextDueAfter);
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

            {firstUnconfirmedRow && (
              <View style={styles.discardBox}>
                <ThemedText type="small" themeColor="textSecondary">
                  ¿Los ciclos sin tildar en realidad no pasaron y no van a pasar (p.ej. días de
                  prueba)? Descartalos para que dejen de aparecer como pendientes; el
                  vencimiento pasa directo al {formatDate(confirmation.nextDueAfter)}.
                </ThemedText>
                <Pressable
                  onPress={handleDiscardRest}
                  disabled={!canDiscard}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText
                    type="link"
                    style={!canDiscard ? styles.disabledButton : undefined}>
                    Descartar los no marcados
                  </ThemedText>
                </Pressable>
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
  discardBox: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  errorText: {
    color: '#E5484D',
    marginTop: Spacing.two,
    fontWeight: '600',
  },
});
