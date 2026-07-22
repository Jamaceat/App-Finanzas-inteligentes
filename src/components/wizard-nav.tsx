import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function symbol(ios: SFSymbol, android: AndroidSymbol) {
  return { ios, android, web: android };
}

// En el celular no hay hover: la explicación de cada paso se revela tocando el
// ícono (i), como un globo/tooltip que se abre y cierra en el lugar (sin medir
// posiciones ni overlays flotantes, que son frágiles en React Native).
export function StepInfo({ text, accentColor }: { text: string; accentColor: string }) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        hitSlop={10}
        style={({ pressed }) => pressed && styles.pressed}>
        <SymbolView name={symbol('info.circle.fill', 'info')} tintColor={accentColor} size={18} />
      </Pressable>
      {open && (
        <ThemedView type="backgroundSelected" style={styles.bubble}>
          <ThemedText type="small" themeColor="textSecondary">
            {text}
          </ThemedText>
        </ThemedView>
      )}
    </View>
  );
}

export function StepHeading({
  title,
  info,
  accentColor,
}: {
  title: string;
  info: string;
  accentColor: string;
}) {
  return (
    <View style={styles.headingRow}>
      <ThemedText type="subtitle" style={styles.headingText}>
        {title}
      </ThemedText>
      <StepInfo text={info} accentColor={accentColor} />
    </View>
  );
}

export function WizardProgress({
  step,
  total,
  accentColor,
}: {
  step: number;
  total: number;
  accentColor: string;
}) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.progressDot,
            { backgroundColor: index <= step ? accentColor : 'transparent', borderColor: accentColor },
          ]}
        />
      ))}
    </View>
  );
}

export function WizardFooter({
  accentColor,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  showBack,
}: {
  accentColor: string;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  showBack: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.footerRow}>
      {showBack && (
        <Pressable onPress={onBack} style={({ pressed }) => pressed && styles.pressed}>
          <View style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name={symbol('chevron.left', 'chevron_left')} tintColor={theme.text} size={16} />
            <ThemedText type="smallBold">Atrás</ThemedText>
          </View>
        </Pressable>
      )}
      <Pressable
        onPress={onNext}
        disabled={nextDisabled}
        style={({ pressed }) => [styles.nextFlex, pressed && !nextDisabled && styles.pressed]}>
        <View
          style={[
            styles.nextButton,
            { backgroundColor: accentColor, opacity: nextDisabled ? 0.5 : 1 },
          ]}>
          <ThemedText type="smallBold" style={styles.nextLabel}>
            {nextLabel}
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headingText: {
    fontSize: 22,
    lineHeight: 28,
  },
  bubble: {
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    borderWidth: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  nextFlex: {
    flex: 1,
  },
  nextButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  nextLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});
