import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TankSearchModal, type SearchTankItem } from '@/components/tank-search-modal';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { FREE_TANK_COLOR, TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import {
  listDeletedTransactions,
  permanentlyDeleteTransaction,
  restoreTransaction,
  type TransactionKind,
} from '@/db/queries/transactions';
import { addInterval, computeFreeCashTank, computeIncomeTanks } from '@/db/queries/tanks';
import {
  useActiveRules,
  useActiveSections,
  useAllRules,
  useAppSettingsRows,
  useTankTransactions,
} from '@/providers/app-data';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export default function TrashScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [kind, setKind] = useState<TransactionKind>('expense');

  const { data: deletedTransactions } = useLiveQuery(listDeletedTransactions(kind), [kind]);

  const rules = useActiveRules();
  const allRules = useAllRules();
  const transactions = useTankTransactions();
  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();

  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);

  const incomeTanks = useMemo(
    () => computeIncomeTanks(rules, transactions, allRules),
    [rules, transactions, allRules],
  );
  const freeCashTank = useMemo(() => {
    const tankMaxRenewalValue = settingsRows?.[0]?.tankMaxRenewalValue ?? 30;
    const tankMaxRenewalUnit = settingsRows?.[0]?.tankMaxRenewalUnit ?? 'days';
    const windowStart = addInterval(new Date(), -tankMaxRenewalValue, tankMaxRenewalUnit);
    return computeFreeCashTank(rules, transactions, windowStart, allRules);
  }, [rules, transactions, settingsRows, allRules]);

  // Mismos tanques (incl. Libre) que asignar-gastos/QuickAddForm: el disponible actual,
  // no el que había al momento de borrar, porque puede haber cambiado mientras tanto.
  const tanks: SearchTankItem[] = useMemo(() => {
    const list: SearchTankItem[] = [
      {
        ruleId: undefined,
        label: 'Libre',
        amount: freeCashTank.level,
        capacity: Math.max(freeCashTank.capacity, 1),
        color: FREE_TANK_COLOR,
      },
    ];
    incomeTanks.forEach((tank) => {
      list.push({
        ruleId: tank.ruleId,
        label: tank.label,
        amount: tank.level,
        capacity: Math.max(tank.capacity, 1),
        color: TANK_COLOR,
      });
    });
    return list;
  }, [freeCashTank, incomeTanks]);

  const tankByRuleId = useMemo(
    () => new Map(tanks.filter((tank) => tank.ruleId !== undefined).map((tank) => [tank.ruleId as number, tank])),
    [tanks],
  );

  const [restoringExpenseId, setRestoringExpenseId] = useState<number | null>(null);
  const restoringExpense = useMemo(
    () => deletedTransactions.find((transaction) => transaction.id === restoringExpenseId) ?? null,
    [deletedTransactions, restoringExpenseId],
  );
  const [restoreTankChoice, setRestoreTankChoice] = useState<SearchTankItem | null>(null);
  const [tankModalVisible, setTankModalVisible] = useState(false);
  const [tankSearchQuery, setTankSearchQuery] = useState('');

  function openRestoreExpense(transactionId: number, previousTankRuleId: number | null) {
    setRestoringExpenseId(transactionId);
    if (previousTankRuleId === null) {
      setRestoreTankChoice(tanks.find((tank) => tank.ruleId === undefined) ?? null);
    } else {
      // Si el tanque previo ya no existe (regla archivada/reemplazada), no se
      // preselecciona nada: el usuario tiene que elegir uno explícitamente.
      setRestoreTankChoice(tankByRuleId.get(previousTankRuleId) ?? null);
    }
  }

  function closeRestoreExpense() {
    setRestoringExpenseId(null);
    setRestoreTankChoice(null);
    setTankSearchQuery('');
  }

  function confirmRestoreIncome(id: number, amount: number, occurredAt: Date) {
    Alert.alert(
      'Restaurar ingreso',
      `¿Restaurar este ingreso de ${formatCurrency(amount)} del ${dateFormatter.format(occurredAt)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: () => {
            restoreTransaction(id).catch(console.error);
          },
        },
      ],
    );
  }

  async function confirmRestoreExpense() {
    if (!restoringExpense || !restoreTankChoice) return;
    const chosenRuleId = restoreTankChoice.ruleId ?? null;
    await restoreTransaction(restoringExpense.id, chosenRuleId);
    closeRestoreExpense();
  }

  function confirmPurge(id: number) {
    Alert.alert(
      'Eliminar definitivamente',
      'Esta acción no se puede deshacer: la transacción se borra para siempre.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            permanentlyDeleteTransaction(id).catch(console.error);
          },
        },
      ],
    );
  }

  const noTankCoversRestore =
    restoringExpense !== null && !tanks.some((tank) => tank.amount >= restoringExpense.amount);
  const chosenCanCover =
    restoringExpense !== null && restoreTankChoice !== null && restoreTankChoice.amount >= restoringExpense.amount;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: BottomTabInset + Spacing.three }]}
        >
          <View style={styles.titleRow}>
            <ThemedText type="title" style={styles.title}>
              Papelera
            </ThemedText>
            <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
              <SymbolView name={symbol('xmark', 'close')} tintColor={theme.text} size={22} />
            </Pressable>
          </View>

          <View style={styles.kindRow}>
            <Pressable style={styles.kindButton} onPress={() => setKind('expense')}>
              <ThemedView
                type={kind === 'expense' ? 'backgroundSelected' : 'background'}
                style={styles.kindButtonInner}>
                <ThemedText type="small">Gastos</ThemedText>
              </ThemedView>
            </Pressable>
            <Pressable style={styles.kindButton} onPress={() => setKind('income')}>
              <ThemedView
                type={kind === 'income' ? 'backgroundSelected' : 'background'}
                style={styles.kindButtonInner}>
                <ThemedText type="small">Ingresos</ThemedText>
              </ThemedView>
            </Pressable>
          </View>

          {deletedTransactions.length === 0 && (
            <ThemedText themeColor="textSecondary">
              No hay {kind === 'income' ? 'ingresos' : 'gastos'} en la papelera.
            </ThemedText>
          )}

          <View style={styles.list}>
            {deletedTransactions.map((transaction) => {
              const section = sectionById.get(transaction.sectionId);
              const tankRuleId = transaction.allocatedIncomeRuleId;
              const tankLabel =
                kind === 'expense'
                  ? (tankRuleId !== null ? (tankByRuleId.get(tankRuleId)?.label ?? 'Tanque no disponible') : 'Libre')
                  : null;
              return (
                <ThemedView key={transaction.id} type="backgroundElement" style={styles.row}>
                  <View style={styles.rowMain}>
                    <ThemedText type="smallBold">{section?.name ?? 'Sección'}</ThemedText>
                    {transaction.description ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {transaction.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary">
                      {dateFormatter.format(transaction.occurredAt)}
                      {tankLabel ? ` · Salía de: ${tankLabel}` : ''}
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      style={{ color: kind === 'expense' ? '#E5484D' : '#30A46C' }}>
                      {kind === 'expense' ? '-' : '+'}
                      {formatCurrency(transaction.amount)}
                    </ThemedText>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() =>
                        kind === 'income'
                          ? confirmRestoreIncome(transaction.id, transaction.amount, transaction.occurredAt)
                          : openRestoreExpense(transaction.id, transaction.allocatedIncomeRuleId)
                      }
                      style={({ pressed }) => pressed && styles.pressed}>
                      <ThemedView type="backgroundSelected" style={styles.actionButton}>
                        <ThemedText type="small">Restaurar</ThemedText>
                      </ThemedView>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmPurge(transaction.id)}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <View style={styles.purgeButton}>
                        <ThemedText type="small" style={styles.purgeButtonText}>
                          Eliminar definitivamente
                        </ThemedText>
                      </View>
                    </Pressable>
                  </View>
                </ThemedView>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>

      {restoringExpense && (
        <View style={styles.confirmOverlay}>
          <ThemedView type="backgroundElement" style={styles.confirmCard}>
            <ThemedText type="smallBold">Restaurar gasto</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatCurrency(restoringExpense.amount)} del {dateFormatter.format(restoringExpense.occurredAt)}
            </ThemedText>

            {noTankCoversRestore ? (
              <ThemedText type="small" style={styles.warningText}>
                Ningún tanque tiene fondos suficientes para restaurar este gasto.
              </ThemedText>
            ) : (
              <>
                <Pressable
                  onPress={() => setTankModalVisible(true)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <View style={[styles.tankPicker, { backgroundColor: theme.background }]}>
                    <View
                      style={[
                        styles.tankPickerDot,
                        { backgroundColor: restoreTankChoice?.color ?? FREE_TANK_COLOR },
                      ]}
                    />
                    <ThemedText type="small" style={styles.tankPickerLabel}>
                      {restoreTankChoice
                        ? `Va a: ${restoreTankChoice.label} (${formatCurrency(restoreTankChoice.amount)} disp.)`
                        : 'Elige un tanque'}
                    </ThemedText>
                    <SymbolView
                      name={symbol('chevron.right', 'chevron_right')}
                      tintColor={theme.textSecondary}
                      size={14}
                    />
                  </View>
                </Pressable>
                {restoreTankChoice && !chosenCanCover && (
                  <ThemedText type="small" style={styles.warningText}>
                    Este tanque no alcanza para cubrir el gasto completo.
                  </ThemedText>
                )}
              </>
            )}

            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeRestoreExpense}
                style={({ pressed }) => [styles.confirmActionButtonWrapper, pressed && styles.pressed]}>
                <View style={[styles.confirmActionButton, { backgroundColor: theme.background }]}>
                  <ThemedText type="small">Cancelar</ThemedText>
                </View>
              </Pressable>
              <Pressable
                disabled={!chosenCanCover}
                onPress={confirmRestoreExpense}
                style={({ pressed }) => [styles.confirmActionButtonWrapper, pressed && styles.pressed]}>
                <View
                  style={[
                    styles.confirmActionButton,
                    { backgroundColor: chosenCanCover ? theme.backgroundSelected : theme.background },
                    !chosenCanCover && styles.confirmActionButtonDisabled,
                  ]}>
                  <ThemedText type="smallBold">Confirmar restauración</ThemedText>
                </View>
              </Pressable>
            </View>
          </ThemedView>

          <TankSearchModal
            visible={tankModalVisible}
            onClose={() => setTankModalVisible(false)}
            tanks={tanks}
            searchQuery={tankSearchQuery}
            onSearchQueryChange={setTankSearchQuery}
            onSelectTank={(tank) => {
              setRestoreTankChoice(tank);
              setTankModalVisible(false);
              setTankSearchQuery('');
            }}
          />
        </View>
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
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  list: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowMain: {
    gap: Spacing.half,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  actionButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  purgeButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#E5484D',
  },
  purgeButtonText: {
    color: '#E5484D',
  },
  pressed: {
    opacity: 0.7,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
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
  warningText: {
    color: '#E5484D',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  confirmActionButtonWrapper: {
    flex: 1,
  },
  confirmActionButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  confirmActionButtonDisabled: {
    opacity: 0.5,
  },
});
