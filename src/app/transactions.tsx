import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createTransaction, listTransactions, type TransactionKind } from '@/db/queries/transactions';
import { listActiveSections } from '@/db/queries/sections';

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
                <ThemedView style={styles.rowMain}>
                  <ThemedText type="smallBold">{section?.name ?? 'Sección'}</ThemedText>
                  {transaction.description ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {transaction.description}
                    </ThemedText>
                  ) : null}
                </ThemedView>
                <ThemedText
                  type="smallBold"
                  style={{ color: isExpense ? '#E5484D' : '#30A46C' }}>
                  {isExpense ? '-' : '+'}
                  {transaction.amount.toFixed(2)}
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
    <ThemedView style={styles.chipRow}>
      <FilterChip label="Todas" selected={selectedId === undefined} onPress={() => onSelect(undefined)} />
      {sections.map((section) => (
        <FilterChip
          key={section.id}
          label={section.name}
          selected={selectedId === section.id}
          onPress={() => onSelect(section.id)}
        />
      ))}
    </ThemedView>
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
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [sectionId, setSectionId] = useState<number | undefined>(sections[0]?.id);

  const selectedSectionId = sectionId ?? sections[0]?.id;

  async function handleSubmit() {
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!selectedSectionId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    await createTransaction({
      sectionId: selectedSectionId,
      amount: parsedAmount,
      kind,
      description: description.trim() || undefined,
      occurredAt: new Date(),
    });

    setAmount('');
    setDescription('');
  }

  if (sections.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.form}>
        <ThemedText themeColor="textSecondary">
          Creá una sección primero para poder registrar transacciones.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <ThemedView style={styles.kindRow}>
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
      </ThemedView>

      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Monto"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />

      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Descripción (opcional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />

      <ThemedView style={styles.chipRow}>
        {sections.map((section) => (
          <FilterChip
            key={section.id}
            label={section.name}
            selected={selectedSectionId === section.id}
            onPress={() => setSectionId(section.id)}
          />
        ))}
      </ThemedView>

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
