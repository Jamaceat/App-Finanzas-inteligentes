import React, { useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/lib/format';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

export type SearchTankItem = {
  ruleId?: number;
  label: string;
  amount: number;
  capacity: number;
  // false cuando `capacity` es un piso artificial (sin objetivo/límite real, p. ej.
  // el tanque Libre sin ingresos libres recientes) en vez de un objetivo real.
  hasTarget?: boolean;
  color: string;
};

type TankSearchModalProps = {
  visible: boolean;
  onClose: () => void;
  tanks: SearchTankItem[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSelectTank: (tank: SearchTankItem) => void;
};

export function TankSearchModal({
  visible,
  onClose,
  tanks,
  searchQuery,
  onSearchQueryChange,
  onSelectTank,
}: TankSearchModalProps) {
  const theme = useTheme();

  const filteredTanks = useMemo(() => {
    if (!searchQuery.trim()) return tanks;
    const query = searchQuery.toLowerCase().trim();
    return tanks.filter((tank) => tank.label.toLowerCase().includes(query));
  }, [tanks, searchQuery]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.modalContainer}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="subtitle">Buscar Tanque</ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <SymbolView
                name={symbol('xmark', 'close')}
                tintColor={theme.text}
                size={22}
              />
            </Pressable>
          </View>

          {/* Search Input */}
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={symbol('magnifyingglass', 'search')}
              tintColor={theme.textSecondary}
              size={18}
            />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder="Buscar por nombre..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
              autoFocus
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => onSearchQueryChange('')}
                style={styles.clearButton}
              >
                <SymbolView
                  name={symbol('xmark.circle.fill', 'cancel')}
                  tintColor={theme.textSecondary}
                  size={16}
                />
              </Pressable>
            )}
          </View>

          {/* Results List */}
          {filteredTanks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <SymbolView
                name={symbol('info.circle', 'info')}
                tintColor={theme.textSecondary}
                size={36}
              />
              <ThemedText
                type="default"
                themeColor="textSecondary"
                style={styles.emptyText}
              >
                No se encontraron tanques
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={filteredTanks}
              keyExtractor={(item, index) =>
                item.ruleId !== undefined ? `tank-${item.ruleId}` : `tank-free-${index}`
              }
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onSelectTank(item)}
                  style={[
                    styles.tankCard,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <MiniTank
                    amount={item.amount}
                    capacity={item.capacity}
                    color={item.color}
                  />
                  <View style={styles.tankCardDetails}>
                    <ThemedText type="smallBold">{item.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.hasTarget === false
                        ? formatCurrency(item.amount)
                        : `${formatCurrency(item.amount)} de ${formatCurrency(item.capacity)}`}
                    </ThemedText>
                  </View>
                  <SymbolView
                    name={symbol('chevron.right', 'chevron_right')}
                    tintColor={theme.textSecondary}
                    size={16}
                  />
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

function MiniTank({
  amount,
  capacity,
  color,
}: {
  amount: number;
  capacity: number;
  color: string;
}) {
  const theme = useTheme();
  const ratio = Math.max(0, Math.min(1, amount / capacity));

  return (
    <View style={[styles.miniTankBody, { borderColor: theme.textSecondary }]}>
      <View
        style={[
          styles.miniTankFill,
          { backgroundColor: color, height: `${ratio * 100}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  closeButton: {
    padding: Spacing.one,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  clearButton: {
    padding: Spacing.half,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  tankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  tankCardDetails: {
    flex: 1,
    gap: Spacing.half,
  },
  miniTankBody: {
    width: 24,
    height: 38,
    borderWidth: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  miniTankFill: {
    width: '100%',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  emptyText: {
    marginTop: Spacing.one,
  },
});
