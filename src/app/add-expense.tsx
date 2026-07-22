import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QuickAddForm } from '@/components/quick-add-form';
import type { SearchTankItem } from '@/components/tank-search-modal';
import { EXPENSE_COLOR, FREE_TANK_COLOR, TANK_COLOR } from '@/constants/constants';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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

export default function AddExpenseScreen() {
  const theme = useTheme();
  const sections = useActiveSections();
  const rules = useActiveRules();
  const allRules = useAllRules();
  const transactions = useTankTransactions();
  const settingsRows = useAppSettingsRows();
  const settings = settingsRows[0] ?? { tankMaxRenewalValue: 30, tankMaxRenewalUnit: 'days' as const };

  const incomeTanks = useMemo(
    () => computeIncomeTanks(rules, transactions, allRules),
    [rules, transactions, allRules],
  );
  const freeCashTank = useMemo(() => {
    const windowStart = addInterval(
      new Date(),
      -settings.tankMaxRenewalValue,
      settings.tankMaxRenewalUnit,
    );
    return computeFreeCashTank(rules, transactions, windowStart, allRules);
  }, [rules, transactions, settings.tankMaxRenewalValue, settings.tankMaxRenewalUnit, allRules]);

  const tanks: SearchTankItem[] = useMemo(() => {
    const list: SearchTankItem[] = [
      {
        ruleId: undefined,
        label: 'Libre',
        amount: freeCashTank.level,
        capacity: Math.max(freeCashTank.capacity, 1),
        hasTarget: freeCashTank.capacity > 0,
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.iconBadge, { backgroundColor: EXPENSE_COLOR }]}>
              <SymbolView name={symbol('arrow.up.circle.fill', 'arrow_circle_up')} tintColor="#ffffff" size={22} />
            </View>
            <ThemedText type="title" style={[styles.title, { color: EXPENSE_COLOR }]}>
              Nuevo gasto
            </ThemedText>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <SymbolView name={symbol('xmark.circle.fill', 'cancel')} tintColor={theme.textSecondary} size={26} />
          </Pressable>
        </View>

        <QuickAddForm kind="expense" accentColor={EXPENSE_COLOR} sections={sections} tanks={tanks} />
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
    paddingHorizontal: Spacing.four,
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
  pressed: {
    opacity: 0.7,
  },
});
