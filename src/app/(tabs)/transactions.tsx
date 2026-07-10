import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TankSearchModal, type SearchTankItem } from '@/components/tank-search-modal';
import { TransactionDetailModal, type TransactionDetailData } from '@/components/transaction-detail-modal';
import { PaginationControls } from '@/components/pagination-controls';
import { FilterChip } from '@/components/filter-chip';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { FREE_TANK_COLOR, SPECIAL_TANK_COLOR, TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import { usePagination } from '@/hooks/use-pagination';
import {
  countTransactions,
  createTransaction,
  listTransactions,
  type TransactionKind,
} from '@/db/queries/transactions';
import { getOrCreateDefaultSection } from '@/db/queries/sections';
import { listAllRecurringRules } from '@/db/queries/recurring-rules';
import { computeFreeCashTank, computeIncomeTanks, addInterval } from '@/db/queries/tanks';
import {
  useActiveRules,
  useActiveSections,
  useAppSettingsRows,
  useTankTransactions,
} from '@/providers/app-data';

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

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

const TRANSACTIONS_PAGE_SIZE = 20;

export default function TransactionsScreen() {
  const { kind: initialKind } = useLocalSearchParams<{ kind?: TransactionKind }>();
  const [sectionFilter, setSectionFilter] = useState<number | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();
  const settings = settingsRows[0] ?? { tankMaxRenewalValue: 30, tankMaxRenewalUnit: 'days' as const };
  const pageSize = settingsRows[0]?.transactionsPageSize ?? TRANSACTIONS_PAGE_SIZE;
  const { data: transactionCountRows } = useLiveQuery(
    countTransactions({ sectionId: sectionFilter, search: searchText }),
    [sectionFilter, searchText],
  );
  const pagination = usePagination({
    pageSize,
    totalCount: transactionCountRows[0]?.count ?? 0,
    resetKey: `${sectionFilter ?? 'all'}:${searchText}:${pageSize}`,
  });
  const { data: transactions } = useLiveQuery(
    listTransactions({
      sectionId: sectionFilter,
      search: searchText,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [sectionFilter, searchText, pagination.offset, pagination.pageSize],
  );
  const rules = useActiveRules();
  const { data: allRules } = useLiveQuery(listAllRecurringRules());
  const allTransactions = useTankTransactions();

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const ruleById = useMemo(
    () => new Map(allRules.map((rule) => [rule.id, rule])),
    [allRules],
  );

  const incomeTanks = useMemo(
    () => computeIncomeTanks(rules, allTransactions, allRules),
    [rules, allTransactions, allRules],
  );
  const freeCashTank = useMemo(() => {
    const windowStart = addInterval(
      new Date(),
      -settings.tankMaxRenewalValue,
      settings.tankMaxRenewalUnit,
    );
    return computeFreeCashTank(rules, allTransactions, windowStart, allRules);
  }, [rules, allTransactions, settings.tankMaxRenewalValue, settings.tankMaxRenewalUnit, allRules]);

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

  const tankLabelByRuleId = useMemo(
    () => new Map(incomeTanks.map((tank) => [tank.ruleId, tank.label])),
    [incomeTanks],
  );

  function resolveTankInfo(tankRuleId: number | null): { label: string; color: string } {
    if (tankRuleId === null) {
      return { label: 'Libre', color: FREE_TANK_COLOR };
    }
    const activeLabel = tankLabelByRuleId.get(tankRuleId);
    if (activeLabel !== undefined) {
      return { label: activeLabel, color: TANK_COLOR };
    }
    const rule = ruleById.get(tankRuleId);
    if (rule) {
      return { label: rule.label, color: rule.tankKind === 'special' ? SPECIAL_TANK_COLOR : TANK_COLOR };
    }
    return { label: 'Libre', color: FREE_TANK_COLOR };
  }

  const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null);
  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [transactions, selectedTransactionId],
  );
  const selectedDetail: TransactionDetailData | null = useMemo(() => {
    if (!selectedTransaction) return null;
    const isExpense = selectedTransaction.kind === 'expense';
    const tankRuleId = isExpense
      ? selectedTransaction.allocatedIncomeRuleId
      : selectedTransaction.recurringRuleId;
    const tankInfo = resolveTankInfo(tankRuleId);
    const section = sectionById.get(selectedTransaction.sectionId);
    const rule =
      selectedTransaction.recurringRuleId !== null
        ? ruleById.get(selectedTransaction.recurringRuleId)
        : undefined;
    return {
      id: selectedTransaction.id,
      kind: selectedTransaction.kind,
      amount: selectedTransaction.amount,
      description: selectedTransaction.description,
      occurredAt: selectedTransaction.occurredAt,
      createdAt: selectedTransaction.createdAt,
      sectionName: section?.name,
      tankLabel: tankInfo.label,
      tankColor: tankInfo.color,
      rule: rule
        ? {
            label: rule.label,
            frequency: rule.frequency,
            customIntervalValue: rule.customIntervalValue,
            customIntervalUnit: rule.customIntervalUnit,
            isVariableAmount: rule.isVariableAmount,
            nextDueDate: rule.nextDueDate,
            archivedAt: rule.archivedAt,
          }
        : undefined,
    };
  }, [selectedTransaction, ruleById, sectionById, tankLabelByRuleId]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="title" style={styles.title}>
            Transacciones
          </ThemedText>

          <QuickAddForm sections={sections} tanks={tanks} initialKind={initialKind} />

          <TransactionSearchBar value={searchText} onChangeText={setSearchText} />

          {sections.length > 0 && (
            <SectionFilterRow
              sections={sections}
              selectedId={sectionFilter}
              onSelect={setSectionFilter}
            />
          )}

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
            {transactions.length === 0 && (
              <ThemedText themeColor="textSecondary">Sin transacciones todavía.</ThemedText>
            )}
            {transactions.map((transaction) => {
              const section = sectionById.get(transaction.sectionId);
              const isExpense = transaction.kind === 'expense';
              const tankRuleId = isExpense
                ? transaction.allocatedIncomeRuleId
                : transaction.recurringRuleId;
              const tankLabel = tankRuleId !== null ? tankLabelByRuleId.get(tankRuleId) : undefined;
              const recurringRule =
                transaction.recurringRuleId !== null ? ruleById.get(transaction.recurringRuleId) : undefined;
              const rowBackground = recurringRule
                ? recurringRule.isVariableAmount
                  ? 'backgroundRecurringVariable'
                  : 'backgroundRecurringFixed'
                : 'backgroundElement';
              return (
                <Pressable
                  key={transaction.id}
                  onPress={() => setSelectedTransactionId(transaction.id)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type={rowBackground} style={styles.row}>
                    <View style={styles.rowMain}>
                      <ThemedText type="smallBold">{section?.name ?? 'Sección'}</ThemedText>
                      {transaction.description ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {transaction.description}
                        </ThemedText>
                      ) : null}
                      <ThemedText type="small" themeColor="textSecondary">
                        {isExpense ? 'Sale de: ' : 'Se agrega a: '}
                        {tankLabel ?? 'Libre'}
                      </ThemedText>
                    </View>
                    <ThemedText
                      type="smallBold"
                      style={{ color: isExpense ? '#E5484D' : '#30A46C' }}>
                      {isExpense ? '-' : '+'}
                      {formatCurrency(transaction.amount)}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              );
            })}
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

      {selectedDetail && (
        <TransactionDetailModal
          transaction={selectedDetail}
          onClose={() => setSelectedTransactionId(null)}
        />
      )}
    </ThemedView>
  );
}

function TransactionSearchBar({
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
        placeholder="Buscar por descripción..."
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

function SectionFilterRow({
  sections,
  selectedId,
  onSelect,
}: {
  sections: { id: number; name: string }[];
  selectedId: number | undefined;
  onSelect: (id: number | undefined) => void;
}) {
  return (
    <View style={styles.chipRow}>
      <FilterChip label="Todas" selected={selectedId === undefined} onPress={() => onSelect(undefined)} />
      {sections.map((section) => (
        <FilterChip
          key={section.id}
          label={section.name}
          selected={selectedId === section.id}
          onPress={() => onSelect(section.id)}
        />
      ))}
    </View>
  );
}

function QuickAddForm({
  sections,
  tanks,
  initialKind,
}: {
  sections: { id: number; name: string }[];
  tanks: SearchTankItem[];
  initialKind?: TransactionKind;
}) {
  const theme = useTheme();
  const [kind, setKind] = useState<TransactionKind>(initialKind ?? 'expense');
  const [amountDigits, setAmountDigits] = useState('');
  const [description, setDescription] = useState('');
  const [sectionId, setSectionId] = useState<number | undefined>(undefined);
  const [selectedTank, setSelectedTank] = useState<SearchTankItem | null>(null);
  const [tankModalVisible, setTankModalVisible] = useState(false);
  const [tankSearchQuery, setTankSearchQuery] = useState('');

  const parsedAmount = Number(amountDigits || '0') / 100;
  const formattedAmount = formatCurrencyInput(amountDigits);

  function handleAmountChange(text: string) {
    const digitsOnly = text.replace(/\D/g, '');
    setAmountDigits(digitsOnly.replace(/^0+(?=\d)/, ''));
  }

  async function handleSubmit() {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    const resolvedSectionId = sectionId ?? (await getOrCreateDefaultSection()).id;

    await createTransaction({
      sectionId: resolvedSectionId,
      amount: parsedAmount,
      kind,
      description: description.trim() || undefined,
      occurredAt: new Date(),
      allocatedIncomeRuleId: kind === 'expense' ? selectedTank?.ruleId : undefined,
    });

    setAmountDigits('');
    setDescription('');
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <View style={styles.kindRow}>
        <Pressable style={styles.kindButton} onPress={() => setKind('expense')}>
          <ThemedView
            type={kind === 'expense' ? 'backgroundSelected' : 'background'}
            style={styles.kindButtonInner}>
            <ThemedText type="small">Gasto</ThemedText>
          </ThemedView>
        </Pressable>
        <Pressable style={styles.kindButton} onPress={() => setKind('income')}>
          <ThemedView
            type={kind === 'income' ? 'backgroundSelected' : 'background'}
            style={styles.kindButtonInner}>
            <ThemedText type="small">Ingreso</ThemedText>
          </ThemedView>
        </Pressable>
      </View>

      <TextInput
        value={formattedAmount}
        onChangeText={handleAmountChange}
        placeholder="$ 0,00"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />

      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Descripción (opcional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />

      {sections.length > 0 && (
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
      )}

      {kind === 'expense' && (
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
      )}

      <Pressable onPress={handleSubmit} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.submitButton}>
          <ThemedText type="smallBold">Agregar</ThemedText>
        </ThemedView>
      </Pressable>

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
  form: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowMain: {
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
