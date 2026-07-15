import { router } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TransactionKind } from '@/db/queries/transactions';

const INCOME_COLOR = '#30A46C';
const EXPENSE_COLOR = '#E5484D';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

type SymbolName = ReturnType<typeof symbol>;

type QuickAction = {
  key: 'now' | 'fixed' | 'variable';
  label: string;
  hint: string;
  icon: SymbolName;
  enabled: boolean;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: 'now',
    label: 'Ahora',
    hint: 'Se registra en este momento',
    icon: symbol('bolt.fill', 'bolt'),
    enabled: true,
  },
  {
    key: 'fixed',
    label: 'Fijo',
    hint: 'Programado, mismo monto siempre',
    icon: symbol('checkmark.seal.fill', 'verified'),
    enabled: true,
  },
  {
    key: 'variable',
    label: 'Variable',
    hint: 'Programado, monto todavía no lo sabes',
    icon: symbol('questionmark.circle.fill', 'help'),
    enabled: true,
  },
];

export default function CajaScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Caja
        </ThemedText>

        <View style={styles.columnsRow}>
          <TransactionKindColumn
            kind="income"
            title="Ingreso"
            color={INCOME_COLOR}
            icon={symbol('arrow.down.circle.fill', 'arrow_circle_down')}
          />
          <TransactionKindColumn
            kind="expense"
            title="Gasto"
            color={EXPENSE_COLOR}
            icon={symbol('arrow.up.circle.fill', 'arrow_circle_up')}
          />
        </View>

        <View style={styles.secondaryRow}>
          <SecondaryButton
            label="Asignar gastos"
            icon={symbol('shippingbox.fill', 'inventory_2')}
            onPress={() => router.push('/asignar-gastos')}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function SecondaryButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: SymbolName;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryFlex, pressed && styles.pressed]}>
      <ThemedView type="backgroundElement" style={styles.secondaryButton}>
        <SymbolView name={icon} tintColor={theme.textSecondary} size={18} />
        <ThemedText type="small">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function TransactionKindColumn({
  kind,
  title,
  color,
  icon,
}: {
  kind: TransactionKind;
  title: string;
  color: string;
  icon: SymbolName;
}) {
  return (
    <View style={styles.column}>
      <View style={styles.columnHeader}>
        <SymbolView name={icon} tintColor={color} size={28} />
        <ThemedText type="smallBold">{title}</ThemedText>
      </View>

      {QUICK_ACTIONS.map((action) => (
        <QuickActionButton
          key={action.key}
          action={action}
          onPress={() => {
            if (action.key === 'now') {
              router.push({ pathname: '/transactions', params: { kind } });
            } else {
              router.push({
                pathname: '/recurring-rules',
                params: { kind, variable: action.key === 'variable' ? '1' : '0' },
              });
            }
          }}
        />
      ))}
    </View>
  );
}

function QuickActionButton({ action, onPress }: { action: QuickAction; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      disabled={!action.enabled}
      onPress={onPress}
      style={({ pressed }) => pressed && action.enabled && styles.pressed}>
      <ThemedView
        type="backgroundElement"
        style={[styles.actionButton, !action.enabled && styles.actionButtonDisabled]}>
        <SymbolView name={action.icon} tintColor={theme.textSecondary} size={18} />
        <View style={styles.actionTextWrapper}>
          <ThemedText type="small">{action.label}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.actionHint}>
            {action.enabled ? action.hint : `${action.hint} · pronto`}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
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
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.five,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  secondaryFlex: {
    flex: 1,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  column: {
    flex: 1,
    gap: Spacing.two,
  },
  columnHeader: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionTextWrapper: {
    flex: 1,
    gap: 0,
  },
  actionHint: {
    fontSize: 11,
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
