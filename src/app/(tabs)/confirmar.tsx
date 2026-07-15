import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { DeficitConfirmationModal, type TankDeficit } from '@/components/deficit-confirmation-modal';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { type TransactionKind } from '@/db/queries/transactions';
import {
  useActiveRules,
  useActiveSections,
  useAllRules,
  useAppSettingsRows,
  useTankTransactions,
} from '@/providers/app-data';
import {
  addInterval,
  computeFreeCashTank,
  computeIncomeTanks,
  computePendingConfirmations,
  computeSpecialTanks,
  type PendingConfirmation,
} from '@/db/queries/tanks';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ConfirmarScreen() {
  const [kind, setKind] = useState<TransactionKind>('income');
  const rules = useActiveRules();
  const allRules = useAllRules();
  const transactions = useTankTransactions();
  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();

  const [activeConfirmation, setActiveConfirmation] = useState<PendingConfirmation | null>(null);
  const [activeDeficit, setActiveDeficit] = useState<TankDeficit | null>(null);

  const pendingConfirmations = useMemo(
    () => computePendingConfirmations(rules, kind, { allRules, transactions }),
    [rules, kind, allRules, transactions],
  );
  const incomeTanks = useMemo(
    () => computeIncomeTanks(rules, transactions, allRules),
    [rules, transactions, allRules],
  );
  const specialTanks = useMemo(() => computeSpecialTanks(rules, transactions), [rules, transactions]);
  const freeCashTank = useMemo(() => {
    const tankMaxRenewalValue = settingsRows?.[0]?.tankMaxRenewalValue ?? 30;
    const tankMaxRenewalUnit = settingsRows?.[0]?.tankMaxRenewalUnit ?? 'days';
    const windowStart = addInterval(new Date(), -tankMaxRenewalValue, tankMaxRenewalUnit);
    return computeFreeCashTank(rules, transactions, windowStart, allRules);
  }, [rules, transactions, settingsRows, allRules]);
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);

  // Tanques que gastaron/reservaron más de lo que efectivamente recibieron (p.ej. por
  // un ingreso borrado en la papelera): en vez de absorber el faltante en silencio
  // (ver computeIncomeTanks/computeFreeCashTank), se ofrecen acá como un pago único
  // pendiente de confirmar para que el usuario decida cómo taparlo.
  const deficits = useMemo<TankDeficit[]>(() => {
    const list: TankDeficit[] = incomeTanks
      .filter((tank) => tank.deficit > 0)
      .map((tank) => ({
        key: `tank-${tank.ruleId}`,
        ruleId: tank.ruleId,
        label: `Déficit de ${tank.label}`,
        amount: tank.deficit,
      }));
    if (freeCashTank.deficit > 0) {
      list.push({ key: 'libre', ruleId: null, label: 'Déficit de Libre', amount: freeCashTank.deficit });
    }
    return list;
  }, [incomeTanks, freeCashTank]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Confirmar
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Haz efectivos los ciclos pendientes de tus recurrentes.
          </ThemedText>

          {deficits.length > 0 && (
            <View style={styles.deficitSection}>
              <ThemedText type="smallBold" style={styles.deficitTitle}>
                Déficits
              </ThemedText>
              {deficits.map((deficit) => (
                <ThemedView key={deficit.key} type="backgroundElement" style={styles.card}>
                  <View style={styles.cardMain}>
                    <ThemedText type="smallBold">{deficit.label}</ThemedText>
                    <ThemedText type="small" style={styles.deficitAmount}>
                      {currencyFormatter.format(deficit.amount)}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => setActiveDeficit(deficit)}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <ThemedView type="backgroundSelected" style={styles.confirmButton}>
                      <ThemedText type="smallBold">Confirmar</ThemedText>
                    </ThemedView>
                  </Pressable>
                </ThemedView>
              ))}
            </View>
          )}

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
          allRules={allRules}
          onClose={() => setActiveConfirmation(null)}
        />
      )}

      {activeDeficit && (
        <DeficitConfirmationModal
          deficit={activeDeficit}
          incomeTanks={incomeTanks}
          freeCashLevel={freeCashTank.level}
          onClose={() => setActiveDeficit(null)}
        />
      )}
    </ThemedView>
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
  deficitSection: {
    gap: Spacing.two,
  },
  deficitTitle: {
    color: '#E5484D',
  },
  deficitAmount: {
    color: '#E5484D',
    fontWeight: '600',
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
});
