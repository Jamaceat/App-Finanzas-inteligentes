import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createTransaction, listTransactions, type TransactionKind } from '@/db/queries/transactions';
import { getOrCreateDefaultSection, listActiveSections } from '@/db/queries/sections';

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

export default function TransactionsScreen() {
  const { kind: initialKind } = useLocalSearchParams<{ kind?: TransactionKind }>();
  const [sectionFilter, setSectionFilter] = useState<number | undefined>(undefined);

  const { data: sections } = useLiveQuery(listActiveSections());
  const { data: transactions } = useLiveQuery(
    listTransactions({ sectionId: sectionFilter }),
    [sectionFilter],
  );

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Transacciones
        </ThemedText>

        <QuickAddForm sections={sections} initialKind={initialKind} />

        {sections.length > 0 && (
          <SectionFilterRow
            sections={sections}
            selectedId={sectionFilter}
            onSelect={setSectionFilter}
          />
        )}

        <ThemedView style={styles.list}>
          {transactions.length === 0 && (
            <ThemedText themeColor="textSecondary">Sin transacciones todavía.</ThemedText>
          )}
          {transactions.map((transaction) => {
            const section = sectionById.get(transaction.sectionId);
            const isExpense = transaction.kind === 'expense';
            return (
              <ThemedView key={transaction.id} type="backgroundElement" style={styles.row}>
                <View style={styles.rowMain}>
                  <ThemedText type="smallBold">{section?.name ?? 'Sección'}</ThemedText>
                  {transaction.description ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {transaction.description}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText
                  type="smallBold"
                  style={{ color: isExpense ? '#E5484D' : '#30A46C' }}>
                  {isExpense ? '-' : '+'}
                  {formatCurrency(transaction.amount)}
                </ThemedText>
              </ThemedView>
            );
          })}
        </ThemedView>
      </SafeAreaView>
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

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.chip}>
        <ThemedText type="small">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function QuickAddForm({
  sections,
  initialKind,
}: {
  sections: { id: number; name: string }[];
  initialKind?: TransactionKind;
}) {
  const theme = useTheme();
  const [kind, setKind] = useState<TransactionKind>(initialKind ?? 'expense');
  const [amountDigits, setAmountDigits] = useState('');
  const [description, setDescription] = useState('');
  const [sectionId, setSectionId] = useState<number | undefined>(undefined);

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

      <Pressable onPress={handleSubmit} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.submitButton}>
          <ThemedText type="smallBold">Agregar</ThemedText>
        </ThemedView>
      </Pressable>
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
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
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
