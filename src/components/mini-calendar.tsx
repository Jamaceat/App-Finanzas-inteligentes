import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ORIGIN_COLOR = '#0091FF';

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function dayKey(date: Date): number {
  return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function MiniCalendar({
  value,
  onChange,
  highlightDates,
  highlightColor,
  minDate,
  cycleStart,
  cycleEnd,
  originalStartDate,
}: {
  value: Date;
  onChange: (date: Date) => void;
  highlightDates: Date[];
  highlightColor: string;
  minDate?: Date;
  cycleStart?: Date;
  cycleEnd?: Date;
  originalStartDate?: Date;
}) {
  const theme = useTheme();
  const [viewDate, setViewDate] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setViewDate(new Date(value.getFullYear(), value.getMonth(), 1));
    }, 0);
    return () => clearTimeout(id);
  }, [value]);

  // Set de días resaltados: evita highlightDates.some(isSameDay) por cada una
  // de las 42 celdas de la grilla.
  const highlightDayKeys = useMemo(
    () => new Set(highlightDates.map(dayKey)),
    [highlightDates],
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  function goToMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
  }

  function handleGoToToday() {
    const today = startOfToday();
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  // Si el usuario quiere ver/enfocar ciclo origen, ciclo actual o fin de ciclo,
  // solo cambiamos el mes visible (setViewDate) para que lo visualice,
  // sin forzar una selección/cambio de fecha (onChange).
  function handleGoToOriginalStart() {
    if (!originalStartDate) return;
    setViewDate(new Date(originalStartDate.getFullYear(), originalStartDate.getMonth(), 1));
  }

  function handleGoToCycleStart() {
    if (!cycleStart) return;
    setViewDate(new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 1));
  }

  function handleGoToCycleEnd() {
    if (!cycleEnd) return;
    setViewDate(new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), 1));
  }

  const gridWidth = containerWidth > 0 ? Math.round(containerWidth - Spacing.two * 2) : 0;
  const cellWidth = gridWidth > 0 ? Math.floor(gridWidth / 7) : undefined;
  const daySize = cellWidth ? Math.floor(cellWidth * 0.8) : undefined;
  const dayRadius = daySize ? Math.floor(daySize / 2) : undefined;

  const cellStyle = cellWidth ? { width: cellWidth, height: cellWidth } : styles.calendarCell;
  const dayStyle = daySize && dayRadius
    ? {
        width: daySize,
        height: daySize,
        borderRadius: dayRadius,
        overflow: 'hidden' as const,
      }
    : styles.calendarDay;

  return (
    <ThemedView
      type="background"
      style={styles.calendar}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.calendarHeader}>
        <Pressable
          onPress={() => goToMonth(-1)}
          style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressed]}
        >
          <ThemedText style={styles.monthNavText}>‹</ThemedText>
        </Pressable>
        <ThemedText style={styles.calendarMonthLabel}>
          {monthFormatter.format(viewDate)}
        </ThemedText>
        <Pressable
          onPress={() => goToMonth(1)}
          style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressed]}
        >
          <ThemedText style={styles.monthNavText}>›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.calendarActionsRow}>
        <Pressable
          onPress={handleGoToToday}
          style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
        >
          <ThemedText type="small" themeColor="textSecondary">
            Hoy
          </ThemedText>
        </Pressable>
        {originalStartDate && (
          <Pressable
            onPress={handleGoToOriginalStart}
            style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Inicio ciclo origen
            </ThemedText>
          </Pressable>
        )}
        {cycleStart && (
          <Pressable
            onPress={handleGoToCycleStart}
            style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Inicio ciclo
            </ThemedText>
          </Pressable>
        )}
        {cycleEnd && (
          <Pressable
            onPress={handleGoToCycleEnd}
            style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Final ciclo
            </ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.calendarWeekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <View key={index} style={[styles.calendarCell, cellStyle]}>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {Array.from({ length: cells.length / 7 }, (_, rowIndex) => {
          const rowCells = cells.slice(rowIndex * 7, rowIndex * 7 + 7);

          // Barra de rango única por fila: evita la costura vertical apenas
          // perceptible que aparecía al dibujar dos rectángulos independientes
          // (uno por celda) que se tocaban justo en el borde entre el día de
          // inicio y el siguiente.
          let barLeftFraction: number | null = null;
          let barWidthFraction = 0;
          rowCells.forEach((date, col) => {
            if (!date || cycleStart == null || cycleEnd == null) return;
            if (date < cycleStart || date > cycleEnd) return;

            const isStart = isSameDay(date, cycleStart);
            const isEnd = isSameDay(date, cycleEnd);
            const cellLeft = col / 7;
            const cellRight = (col + 1) / 7;
            const left = isStart ? cellLeft + 1 / 14 : cellLeft;
            const right = isEnd ? cellRight - 1 / 14 : cellRight;

            if (barLeftFraction == null) barLeftFraction = left;
            barWidthFraction = right - barLeftFraction;
          });

          return (
            <View key={rowIndex} style={styles.calendarWeekGridRow}>
              {barLeftFraction != null && barWidthFraction > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: '10%',
                    bottom: '10%',
                    left: `${barLeftFraction * 100}%`,
                    width: `${barWidthFraction * 100}%`,
                    backgroundColor: 'rgba(0, 145, 255, 0.18)',
                  }}
                />
              )}
              {rowCells.map((date, col) => {
                const index = rowIndex * 7 + col;

                if (!date) {
                  return <View key={index} style={[styles.calendarCell, cellStyle]} />;
                }

                const isSelected = isSameDay(date, value);
                const isHighlighted = !isSelected && highlightDayKeys.has(dayKey(date));
                const isDisabled = minDate != null && date < minDate && !isSameDay(date, minDate);
                const isCycleStart = cycleStart != null && isSameDay(date, cycleStart);
                const isCycleEnd = cycleEnd != null && isSameDay(date, cycleEnd);
                const isCycleBoundary = isCycleStart || isCycleEnd;
                const isToday = isSameDay(date, new Date());

                return (
                  <Pressable
                    key={index}
                    disabled={isDisabled}
                    onPress={() => onChange(date)}
                    style={[styles.calendarCell, cellStyle]}
                  >
                    {({ pressed }) => (
                    <View
                      style={[
                        styles.calendarDay,
                        dayStyle,
                        {
                          backgroundColor: isCycleBoundary && !isSelected
                            ? theme.backgroundRecurringFixed
                            : isSelected
                              ? theme.backgroundSelected
                              : 'transparent',
                          borderColor: isCycleBoundary
                            ? ORIGIN_COLOR
                            : isHighlighted
                              ? highlightColor
                              : 'transparent',
                          borderWidth: isCycleBoundary ? 2.5 : 1.5,
                          opacity: isDisabled ? 0.3 : 1,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        style={[
                          isCycleBoundary && !isSelected ? { fontWeight: 'bold' } : undefined,
                          isToday && !isSelected && !isCycleBoundary ? { fontWeight: 'bold' } : undefined,
                        ]}
                      >
                        {date.getDate()}
                      </ThemedText>
                      {isToday && (
                        <View
                          style={{
                            position: 'absolute',
                            bottom: 4,
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: isSelected
                              ? theme.text
                              : ORIGIN_COLOR,
                          }}
                        />
                      )}
                      {pressed && (
                        // Scrim opaco encima del círculo (no opacity en todo el
                        // árbol) para que la barra de rango de la fila de atrás
                        // nunca se filtre de forma asimétrica al presionar.
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.12)',
                          }}
                        />
                      )}
                    </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  calendar: {
    borderRadius: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
  },
  calendarMonthLabel: {
    textTransform: 'capitalize',
    fontSize: 18,
    fontWeight: '600',
  },
  monthNavButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavText: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  calendarActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  todayButton: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  calendarWeekRow: {
    flexDirection: 'row',
  },
  calendarGrid: {
    flexDirection: 'column',
  },
  calendarWeekGridRow: {
    flexDirection: 'row',
    position: 'relative',
  },
  calendarCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDay: {
    width: '80%',
    height: '80%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
