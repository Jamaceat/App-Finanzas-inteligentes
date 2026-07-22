import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionDetailModal, type TransactionDetailData } from '@/components/transaction-detail-modal';
import { PaginationControls } from '@/components/pagination-controls';
import { FilterChip } from '@/components/filter-chip';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { FREE_TANK_COLOR, SPECIAL_TANK_COLOR, TANK_COLOR } from '@/constants/constants';
import { useTheme } from '@/hooks/use-theme';
import { usePagination } from '@/hooks/use-pagination';
import { countTransactions, listTransactions, softDeleteTransaction } from '@/db/queries/transactions';
import { listAllRecurringRules } from '@/db/queries/recurring-rules';
import { computeIncomeTanks } from '@/db/queries/tanks';
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

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

const TRANSACTIONS_PAGE_SIZE = 20;

export default function TransactionsScreen() {
  const router = useRouter();
  const [sectionFilter, setSectionFilter] = useState<number | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();
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

  const theme = useTheme();

  async function handleDeleteSelected() {
    if (selectedTransactionId === null) return;
    await softDeleteTransaction(selectedTransactionId);
    setSelectedTransactionId(null);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleRow}>
            <ThemedText type="title" style={styles.title}>
              Transacciones
            </ThemedText>
            <Pressable
              onPress={() => router.push('/trash')}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}>
              <SymbolView name={symbol('trash', 'delete')} tintColor={theme.textSecondary} size={22} />
            </Pressable>
          </View>

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
          onDelete={handleDeleteSelected}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
