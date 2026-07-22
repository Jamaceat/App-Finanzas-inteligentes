import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PaginationControls } from '@/components/pagination-controls';
import { RuleForm } from '@/components/recurring-rule-form';
import { RuleRow, RuleSearchBar } from '@/components/recurring-rule-list';
import { DEFAULT_SIMULATION_OCCURRENCES, INCOME_COLOR } from '@/constants/constants';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePagination } from '@/hooks/use-pagination';
import {
  archiveRecurringRule,
  countActiveRecurringRules,
  listActiveRecurringRules,
} from '@/db/queries/recurring-rules';
import { useActiveSections, useAppSettingsRows } from '@/providers/app-data';
import { cancelRuleReminder } from '@/lib/notifications';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

const RULES_PAGE_SIZE = 10;

export default function RecurringIncomeListScreen() {
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();
  const settings = settingsRows?.[0];
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: ruleCountRows } = useLiveQuery(
    countActiveRecurringRules({ kind: 'income', search: searchText }),
    [searchText],
  );
  const pagination = usePagination({
    pageSize: RULES_PAGE_SIZE,
    totalCount: ruleCountRows[0]?.count ?? 0,
    resetKey: searchText,
  });
  const { data: rules } = useLiveQuery(
    listActiveRecurringRules({
      kind: 'income',
      search: searchText,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [searchText, pagination.offset, pagination.pageSize],
  );

  const editingRule = rules.find((rule) => rule.id === editingId);
  const simulationOccurrences = settings?.calendarSimulationOccurrences ?? DEFAULT_SIMULATION_OCCURRENCES;
  const restrictPastStartDates = settings?.restrictPastStartDates ?? false;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: INCOME_COLOR }]}>
                <SymbolView name={symbol('arrow.down.circle.fill', 'arrow_circle_down')} tintColor="#ffffff" size={22} />
              </View>
              <ThemedText type="title" style={[styles.title, { color: INCOME_COLOR }]}>
                Ingresos recurrentes
              </ThemedText>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
              <SymbolView name={symbol('xmark.circle.fill', 'cancel')} tintColor={theme.textSecondary} size={26} />
            </Pressable>
          </View>

          {editingRule && (
            <RuleForm
              key={editingRule.id}
              kind="income"
              accentColor={INCOME_COLOR}
              editing={editingRule}
              sections={sections}
              simulationOccurrences={simulationOccurrences}
              restrictPastStartDates={restrictPastStartDates}
              onDone={() => setEditingId(null)}
            />
          )}

          <RuleSearchBar value={searchText} onChangeText={setSearchText} />

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
            {rules.length === 0 && (
              <ThemedText themeColor="textSecondary">Sin ingresos recurrentes todavía.</ThemedText>
            )}
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                sectionName={sections.find((section) => section.id === rule.sectionId)?.name}
                isEditing={rule.id === editingId}
                onEdit={() => setEditingId(rule.id === editingId ? null : rule.id)}
                onArchive={() => {
                  if (editingId === rule.id) {
                    setEditingId(null);
                  }
                  archiveRecurringRule(rule.id);
                  cancelRuleReminder(rule.id);
                }}
              />
            ))}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  list: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
