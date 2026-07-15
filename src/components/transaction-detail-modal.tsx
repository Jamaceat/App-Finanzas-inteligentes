import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { CustomIntervalUnit, RecurringFrequency } from '@/db/queries/recurring-rules';
import { stepBack } from '@/db/queries/tanks';
import { useTheme } from '@/hooks/use-theme';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnlyFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
  custom: 'Personalizado',
};

const CUSTOM_UNIT_LABELS: Record<CustomIntervalUnit, string> = {
  days: 'días',
  weeks: 'semanas',
};

function formatFrequency(
  frequency: RecurringFrequency,
  customIntervalValue: number | null,
  customIntervalUnit: CustomIntervalUnit | null,
): string {
  if (frequency !== 'custom') {
    return FREQUENCY_LABELS[frequency];
  }
  const unitLabel = CUSTOM_UNIT_LABELS[customIntervalUnit ?? 'days'];
  return `Cada ${customIntervalValue ?? 1} ${unitLabel}`;
}

export type TransactionDetailData = {
  id: number;
  kind: 'income' | 'expense';
  amount: number;
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
  sectionName: string | undefined;
  tankLabel: string;
  tankColor: string;
  rule?: {
    label: string;
    frequency: RecurringFrequency;
    customIntervalValue: number | null;
    customIntervalUnit: CustomIntervalUnit | null;
    isVariableAmount: boolean;
    nextDueDate: Date;
    archivedAt: Date | null;
  };
};

export function TransactionDetailModal({
  transaction,
  onClose,
  onDelete,
}: {
  transaction: TransactionDetailData;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [openHint, setOpenHint] = useState<string | null>(null);
  const isExpense = transaction.kind === 'expense';
  const rule = transaction.rule;
  const cycleEnd = transaction.occurredAt;
  const cycleStart = rule
    ? stepBack(cycleEnd, rule.frequency, rule.customIntervalValue, rule.customIntervalUnit)
    : null;

  function handleDeletePress() {
    Alert.alert(
      'Eliminar transacción',
      'Se va a mover a la papelera y el tanque se actualiza al instante. Puedes restaurarla después. El calendario de la regla recurrente no se modifica.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: onDelete },
      ],
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ThemedView type="backgroundElement" style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.header}>
              <ThemedText type="smallBold">Detalle de transacción</ThemedText>
              <ThemedText
                type="title"
                style={{ color: isExpense ? '#E5484D' : '#30A46C', fontSize: 26, lineHeight: 32 }}>
                {isExpense ? '-' : '+'}
                {currencyFormatter.format(transaction.amount)}
              </ThemedText>
              <View style={styles.chipRow}>
                <ThemedView type="background" style={styles.chip}>
                  <ThemedText type="small">{isExpense ? 'Gasto' : 'Ingreso'}</ThemedText>
                </ThemedView>
                <ThemedView type="background" style={styles.chip}>
                  <ThemedText type="small">{rule ? 'Fija (recurrente)' : 'Puntual (única vez)'}</ThemedText>
                </ThemedView>
              </View>
            </View>

            <DetailRow label="Descripción" value={transaction.description ?? 'Sin descripción'} />
            <DetailRow label="Sección" value={transaction.sectionName ?? 'Sin sección'} />
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
                {isExpense ? 'Sale de' : 'Se agrega a'}
              </ThemedText>
              <View style={styles.tankValue}>
                <View style={[styles.tankDot, { backgroundColor: transaction.tankColor }]} />
                <ThemedText type="small" style={styles.rowValue}>
                  {transaction.tankLabel}
                </ThemedText>
              </View>
            </View>

            <View style={styles.divider} />

            <DetailRow
              label="Fecha de la transacción"
              value={dateTimeFormatter.format(transaction.occurredAt)}
              hintKey="occurredAt"
              hint="Cuándo ocurrió el movimiento en la realidad (ej: el día que cobraste o pagaste algo)."
              openHint={openHint}
              onToggleHint={setOpenHint}
            />
            <DetailRow
              label="Fecha de registro"
              value={dateTimeFormatter.format(transaction.createdAt)}
              hintKey="createdAt"
              hint="Cuándo se guardó esta transacción en la app, que puede ser distinto al momento en que ocurrió."
              openHint={openHint}
              onToggleHint={setOpenHint}
            />

            {rule && cycleStart && (
              <>
                <View style={styles.divider} />
                <ThemedText type="smallBold">Regla recurrente</ThemedText>
                <DetailRow label="Nombre" value={rule.label} />
                <DetailRow
                  label="Frecuencia"
                  value={formatFrequency(rule.frequency, rule.customIntervalValue, rule.customIntervalUnit)}
                />
                <DetailRow label="Monto" value={rule.isVariableAmount ? 'Variable' : 'Fijo'} />
                <DetailRow label="Inicio de este ciclo" value={dateOnlyFormatter.format(cycleStart)} />
                <DetailRow label="Inicio del próximo ciclo" value={dateOnlyFormatter.format(cycleEnd)} />
                <DetailRow
                  label="Estado de la regla"
                  value={rule.archivedAt ? 'Desactivada' : 'Activa'}
                />
                {!rule.archivedAt && (
                  <DetailRow
                    label="Próximo vencimiento"
                    value={dateOnlyFormatter.format(rule.nextDueDate)}
                  />
                )}
              </>
            )}

            <Pressable onPress={handleDeletePress} style={({ pressed }) => pressed && styles.pressed}>
              <View style={styles.deleteButton}>
                <ThemedText type="smallBold" style={styles.deleteButtonText}>
                  Eliminar
                </ThemedText>
              </View>
            </Pressable>

            <Pressable onPress={onClose} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="background" style={styles.closeButton}>
                <ThemedText type="smallBold">Cerrar</ThemedText>
              </ThemedView>
            </Pressable>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  hint,
  hintKey,
  openHint,
  onToggleHint,
}: {
  label: string;
  value: string;
  hint?: string;
  hintKey?: string;
  openHint?: string | null;
  onToggleHint?: (key: string | null) => void;
}) {
  const theme = useTheme();
  const isOpen = hintKey !== undefined && openHint === hintKey;

  return (
    <View style={[styles.rowContainer, isOpen && styles.rowContainerOpen]}>
      <View style={styles.row}>
        <View style={styles.rowLabelWithHint}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
            {label}
          </ThemedText>
          {hint && hintKey && (
            <Pressable
              hitSlop={8}
              onPress={() => onToggleHint?.(isOpen ? null : hintKey)}
              style={({ pressed }) => pressed && styles.pressed}>
              <SymbolView name={symbol('info.circle', 'info')} tintColor={theme.textSecondary} size={14} />
            </Pressable>
          )}
        </View>
        <ThemedText type="small" style={styles.rowValue}>
          {value}
        </ThemedText>
      </View>
      {isOpen && hint && (
        <View style={styles.tooltipWrapper} pointerEvents="box-none">
          <View style={[styles.tooltipArrow, { borderBottomColor: theme.backgroundSelected }]} />
          <ThemedView type="backgroundSelected" style={styles.tooltipBubble}>
            <ThemedText type="small" style={styles.tooltipText}>
              {hint}
            </ThemedText>
          </ThemedView>
        </View>
      )}
    </View>
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
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowLabel: {
    flexShrink: 0,
  },
  rowLabelWithHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 0,
  },
  rowContainer: {
    position: 'relative',
    zIndex: 0,
  },
  rowContainerOpen: {
    zIndex: 100,
    elevation: 100,
  },
  tooltipWrapper: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    zIndex: 100,
    elevation: 100,
  },
  tooltipArrow: {
    marginLeft: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tooltipBubble: {
    maxWidth: 260,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  tooltipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
  },
  tankValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  tankDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.3)',
    marginVertical: Spacing.one,
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#E5484D',
  },
  deleteButtonText: {
    color: '#E5484D',
  },
});
