import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createTransaction } from '@/db/queries/transactions';
import { getOrCreateDefaultSection } from '@/db/queries/sections';
import { type IncomeTank } from '@/db/queries/tanks';

export type TankDeficit = {
  key: string;
  ruleId: number | null; // null = Libre
  label: string;
  amount: number;
};

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

// Sentinel para el chip "Libre": nunca colisiona con un ruleId real (autoincremental,
// siempre positivo).
const LIBRE_SENTINEL_ID = -1;

// Confirmación de un pago único (no recurrente): registra el ingreso puntual que
// tapa el déficit detectado (ver computeIncomeTanks/computeFreeCashTank), pidiendo
// a qué tanque va dirigido porque el déficit pudo originarse por un ingreso borrado
// y el usuario puede preferir acreditarlo en otro lado.
export function DeficitConfirmationModal({
  deficit,
  incomeTanks,
  freeCashLevel,
  onClose,
}: {
  deficit: TankDeficit;
  incomeTanks: IncomeTank[];
  freeCashLevel: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [amountDigits, setAmountDigits] = useState(String(Math.round(deficit.amount * 100)));
  const [selectedTankId, setSelectedTankId] = useState<number>(deficit.ruleId ?? LIBRE_SENTINEL_ID);
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = Number(amountDigits || '0') / 100;
  const formattedAmount = formatCurrencyInput(amountDigits);

  const selectedTank = useMemo(
    () => incomeTanks.find((tank) => tank.ruleId === selectedTankId) ?? null,
    [incomeTanks, selectedTankId],
  );

  function handleAmountChange(text: string) {
    const digitsOnly = text.replace(/\D/g, '');
    setAmountDigits(digitsOnly.replace(/^0+(?=\d)/, ''));
  }

  const canConfirm = Number.isFinite(parsedAmount) && parsedAmount > 0 && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const chosenRuleId = selectedTankId === LIBRE_SENTINEL_ID ? null : selectedTankId;
      const sectionId = selectedTank ? selectedTank.sectionId : (await getOrCreateDefaultSection()).id;

      await createTransaction({
        sectionId,
        amount: parsedAmount,
        kind: 'income',
        description: deficit.label,
        occurredAt: new Date(),
        recurringRuleId: chosenRuleId ?? undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ThemedView type="backgroundElement" style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Confirmar pago único
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Registra el ingreso puntual que cubre: {deficit.label}.
            </ThemedText>

            <TextInput
              value={formattedAmount}
              onChangeText={handleAmountChange}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
            />

            <ThemedText type="small" themeColor="textSecondary">
              ¿A qué tanque va dirigido?
            </ThemedText>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setSelectedTankId(LIBRE_SENTINEL_ID)}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView
                  type={selectedTankId === LIBRE_SENTINEL_ID ? 'backgroundSelected' : 'background'}
                  style={styles.chip}>
                  <ThemedText type="small">{`Libre (${currencyFormatter.format(freeCashLevel)})`}</ThemedText>
                </ThemedView>
              </Pressable>
              {incomeTanks.map((tank) => (
                <Pressable
                  key={tank.ruleId}
                  onPress={() => setSelectedTankId(tank.ruleId)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type={selectedTankId === tank.ruleId ? 'backgroundSelected' : 'background'}
                    style={styles.chip}>
                    <ThemedText type="small">{`${tank.label} (${currencyFormatter.format(tank.level)})`}</ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>

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
