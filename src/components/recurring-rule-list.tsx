import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';
import { frequencyDescription, type Rule } from '@/components/recurring-rule-shared';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

export function RuleSearchBar({
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
        placeholder="Buscar por nombre..."
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

export function RuleRow({
  rule,
  sectionName,
  isEditing,
  onEdit,
  onArchive,
}: {
  rule: Rule;
  sectionName?: string;
  isEditing: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <ThemedView type={isEditing ? 'backgroundSelected' : 'backgroundElement'} style={styles.row}>
      <View style={styles.rowMain}>
        <ThemedText type="smallBold">{rule.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {frequencyDescription(rule)} · {sectionName ?? 'Sin sección'}
          {rule.isVariableAmount
            ? ' · Variable'
            : rule.estimatedAmount != null
              ? ` · ${formatCurrency(rule.estimatedAmount)}`
              : ''}
          {rule.reminderEnabled ? ' · Recordatorio' : ''}
        </ThemedText>
      </View>
      <Pressable onPress={onEdit} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" themeColor="textSecondary">
          Editar
        </ThemedText>
      </Pressable>
      <Pressable onPress={onArchive} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" style={{ color: '#E5484D' }}>
          Desactivar
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
