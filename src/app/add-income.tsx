import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QuickAddForm } from '@/components/quick-add-form';
import { INCOME_COLOR } from '@/constants/constants';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveSections } from '@/providers/app-data';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

export default function AddIncomeScreen() {
  const theme = useTheme();
  const sections = useActiveSections();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.iconBadge, { backgroundColor: INCOME_COLOR }]}>
              <SymbolView name={symbol('arrow.down.circle.fill', 'arrow_circle_down')} tintColor="#ffffff" size={22} />
            </View>
            <ThemedText type="title" style={[styles.title, { color: INCOME_COLOR }]}>
              Nuevo ingreso
            </ThemedText>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <SymbolView name={symbol('xmark.circle.fill', 'cancel')} tintColor={theme.textSecondary} size={26} />
          </Pressable>
        </View>

        <QuickAddForm kind="income" accentColor={INCOME_COLOR} sections={sections} tanks={[]} />
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
