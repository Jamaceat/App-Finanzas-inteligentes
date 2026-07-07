import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  archiveSection,
  createSection,
  listActiveSections,
  updateSection,
  type SectionKind,
} from '@/db/queries/sections';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

type SymbolName = ReturnType<typeof symbol>;

const ICON_OPTIONS: { key: string; symbol: SymbolName }[] = [
  { key: 'house', symbol: symbol('house.fill', 'home') },
  { key: 'cart', symbol: symbol('cart.fill', 'shopping_cart') },
  { key: 'car', symbol: symbol('car.fill', 'directions_car') },
  { key: 'fork', symbol: symbol('fork.knife', 'restaurant') },
  { key: 'briefcase', symbol: symbol('briefcase.fill', 'work') },
  { key: 'heart', symbol: symbol('heart.fill', 'favorite') },
  { key: 'gift', symbol: symbol('gift.fill', 'redeem') },
  { key: 'bolt', symbol: symbol('bolt.fill', 'bolt') },
  { key: 'wifi', symbol: symbol('wifi', 'wifi') },
  { key: 'film', symbol: symbol('film.fill', 'movie') },
  { key: 'book', symbol: symbol('book.fill', 'menu_book') },
  { key: 'dumbbell', symbol: symbol('dumbbell.fill', 'fitness_center') },
];

const ICON_BY_KEY = new Map(ICON_OPTIONS.map((option) => [option.key, option.symbol]));

function iconSymbolFor(key: string): SymbolName {
  return ICON_BY_KEY.get(key) ?? ICON_OPTIONS[0].symbol;
}

const COLOR_OPTIONS = [
  '#E5484D',
  '#F76B15',
  '#FFB224',
  '#30A46C',
  '#12A594',
  '#0091FF',
  '#3E63DD',
  '#8E4EC6',
  '#D6409F',
  '#60646C',
];

const KIND_OPTIONS: { value: SectionKind; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'both', label: 'Ambos' },
];

export default function SectionsScreen() {
  const { data: sections } = useLiveQuery(listActiveSections());
  const [editingId, setEditingId] = useState<number | null>(null);

  const editingSection = sections.find((section) => section.id === editingId);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.title}>
          Secciones
        </ThemedText>

        <SectionForm
          key={editingSection?.id ?? 'new'}
          editing={editingSection}
          onDone={() => setEditingId(null)}
        />

        <ThemedView style={styles.list}>
          {sections.length === 0 && (
            <ThemedText themeColor="textSecondary">Sin secciones todavía.</ThemedText>
          )}
          {sections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              isEditing={section.id === editingId}
              onEdit={() => setEditingId(section.id === editingId ? null : section.id)}
              onArchive={() => {
                if (editingId === section.id) {
                  setEditingId(null);
                }
                archiveSection(section.id);
              }}
            />
          ))}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SectionRow({
  section,
  isEditing,
  onEdit,
  onArchive,
}: {
  section: { id: number; name: string; icon: string; color: string; kind: SectionKind };
  isEditing: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const kindLabel = KIND_OPTIONS.find((option) => option.value === section.kind)?.label;

  return (
    <ThemedView type={isEditing ? 'backgroundSelected' : 'backgroundElement'} style={styles.row}>
      <SymbolView name={iconSymbolFor(section.icon)} tintColor={section.color} size={22} />
      <View style={styles.rowMain}>
        <ThemedText type="smallBold">{section.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {kindLabel}
        </ThemedText>
      </View>
      <Pressable onPress={onEdit} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" themeColor="textSecondary">
          Editar
        </ThemedText>
      </Pressable>
      <Pressable onPress={onArchive} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" style={{ color: '#E5484D' }}>
          Archivar
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function SectionForm({
  editing,
  onDone,
}: {
  editing?: { id: number; name: string; icon: string; color: string; kind: SectionKind };
  onDone: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<SectionKind>(editing?.kind ?? 'both');
  const [icon, setIcon] = useState(editing?.icon ?? ICON_OPTIONS[0].key);
  const [color, setColor] = useState(editing?.color ?? COLOR_OPTIONS[0]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    if (editing) {
      await updateSection(editing.id, { name: trimmedName, icon, color, kind });
    } else {
      await createSection({ name: trimmedName, icon, color, kind });
      setName('');
      setKind('both');
      setIcon(ICON_OPTIONS[0].key);
      setColor(COLOR_OPTIONS[0]);
    }

    onDone();
  }

  return (
    <ThemedView type="backgroundElement" style={styles.form}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nombre de la sección"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />

      <View style={styles.chipRow}>
        {KIND_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={kind === option.value}
            onPress={() => setKind(option.value)}
          />
        ))}
      </View>

      <View style={styles.chipRow}>
        {ICON_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setIcon(option.key)}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView
              type={icon === option.key ? 'backgroundSelected' : 'background'}
              style={styles.iconSwatch}>
              <SymbolView name={option.symbol} tintColor={color} size={20} />
            </ThemedView>
          </Pressable>
        ))}
      </View>

      <View style={styles.chipRow}>
        {COLOR_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setColor(option)}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView
              style={[
                styles.colorSwatch,
                { backgroundColor: option },
                color === option && styles.colorSwatchSelected,
              ]}
            />
          </Pressable>
        ))}
      </View>

      <View style={styles.formActions}>
        {editing && (
          <Pressable onPress={onDone} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="background" style={styles.submitButton}>
              <ThemedText type="smallBold">Cancelar</ThemedText>
            </ThemedView>
          </Pressable>
        )}
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [styles.submitFlex, pressed && styles.pressed]}>
          <ThemedView type="backgroundSelected" style={styles.submitButton}>
            <ThemedText type="smallBold">{editing ? 'Guardar' : 'Crear sección'}</ThemedText>
          </ThemedView>
        </Pressable>
      </View>
    </ThemedView>
  );
}

function Chip({
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
      <ThemedView type={selected ? 'backgroundSelected' : 'background'} style={styles.chip}>
        <ThemedText type="small">{label}</ThemedText>
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
  iconSwatch: {
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  submitFlex: {
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
