import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TANK_COLOR } from '@/constants/constants';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

type PageItem = { type: 'page'; page: number } | { type: 'ellipsis'; key: string };

export function getPaginationItems(
  currentPage: number,
  pageCount: number,
  siblingCount = 1,
): PageItem[] {
  const totalVisible = siblingCount * 2 + 5;

  if (pageCount <= totalVisible) {
    return Array.from({ length: pageCount }, (_, page) => ({ type: 'page', page }));
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, pageCount - 2);
  const showLeftEllipsis = leftSibling > 1;
  const showRightEllipsis = rightSibling < pageCount - 2;

  const items: PageItem[] = [{ type: 'page', page: 0 }];

  if (showLeftEllipsis) {
    items.push({ type: 'ellipsis', key: 'start' });
  } else {
    for (let page = 1; page < leftSibling; page++) {
      items.push({ type: 'page', page });
    }
  }

  for (let page = leftSibling; page <= rightSibling; page++) {
    items.push({ type: 'page', page });
  }

  if (showRightEllipsis) {
    items.push({ type: 'ellipsis', key: 'end' });
  } else {
    for (let page = rightSibling + 1; page < pageCount - 1; page++) {
      items.push({ type: 'page', page });
    }
  }

  items.push({ type: 'page', page: pageCount - 1 });

  return items;
}

export type PaginationControlsProps = {
  page: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
};

export function PaginationControls({
  page,
  pageCount,
  hasPreviousPage,
  hasNextPage,
  onPrevious,
  onNext,
  onGoToPage,
}: PaginationControlsProps) {
  const theme = useTheme();
  const items = useMemo(() => getPaginationItems(page, pageCount), [page, pageCount]);

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <Pressable
        onPress={onPrevious}
        disabled={!hasPreviousPage}
        style={({ pressed }) => [styles.arrowButton, pressed && hasPreviousPage && styles.pressed]}>
        <SymbolView
          name={symbol('chevron.left', 'chevron_left')}
          tintColor={hasPreviousPage ? theme.text : theme.textSecondary}
          size={16}
        />
      </Pressable>

      {items.map((item) =>
        item.type === 'ellipsis' ? (
          <ThemedText key={item.key} type="small" themeColor="textSecondary" style={styles.ellipsis}>
            …
          </ThemedText>
        ) : (
          <Pressable
            key={item.page}
            onPress={() => onGoToPage(item.page)}
            disabled={item.page === page}
            style={({ pressed }) => pressed && item.page !== page && styles.pressed}>
            <View style={[styles.pageDot, item.page === page && { backgroundColor: TANK_COLOR }]}>
              <ThemedText
                type="smallBold"
                themeColor={item.page === page ? undefined : 'textSecondary'}
                style={item.page === page ? styles.pageLabelActive : undefined}>
                {item.page + 1}
              </ThemedText>
            </View>
          </Pressable>
        ),
      )}

      <Pressable
        onPress={onNext}
        disabled={!hasNextPage}
        style={({ pressed }) => [styles.arrowButton, pressed && hasNextPage && styles.pressed]}>
        <SymbolView
          name={symbol('chevron.right', 'chevron_right')}
          tintColor={hasNextPage ? theme.text : theme.textSecondary}
          size={16}
        />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    padding: Spacing.two,
    borderRadius: Spacing.four,
  },
  arrowButton: {
    width: 28,
    height: 28,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageLabelActive: {
    color: '#FFFFFF',
  },
  ellipsis: {
    width: 20,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
