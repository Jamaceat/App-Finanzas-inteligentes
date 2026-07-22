import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { RuleForm } from '@/components/recurring-rule-form';
import { DEFAULT_SIMULATION_OCCURRENCES, INCOME_COLOR } from '@/constants/constants';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveSections, useAppSettingsRows } from '@/providers/app-data';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

export default function AddRecurringIncomeScreen() {
  const params = useLocalSearchParams<{ variable?: string }>();
  const theme = useTheme();
  const sections = useActiveSections();
  const settingsRows = useAppSettingsRows();
  const settings = settingsRows?.[0];

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
                Nuevo ingreso recurrente
              </ThemedText>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
              <SymbolView name={symbol('xmark.circle.fill', 'cancel')} tintColor={theme.textSecondary} size={26} />
            </Pressable>
          </View>

          <RuleForm
            kind="income"
            accentColor={INCOME_COLOR}
            sections={sections}
            initialVariable={params.variable === '1'}
            simulationOccurrences={simulationOccurrences}
            restrictPastStartDates={restrictPastStartDates}
            onDone={() => router.back()}
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
  pressed: {
    opacity: 0.7,
  },
});
