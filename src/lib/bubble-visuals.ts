import { BUBBLE_SIZE_VARIABLE_RATIO } from '@/constants/constants';

// Escala visual de una burbuja según su monto, entre `min` y `max`.
// Se usa raíz cuadrada porque el tamaño percibido de un círculo/pill escala con
// el área: sqrt mantiene distinguibles los montos medios y comprime los grandes.
// Montos variables o 0 (amount <= 0) usan un baseline fijo para que no lean como
// "el más barato" de la pantalla.
export function bubbleScale(amount: number, referenceMax: number, min: number, max: number): number {
  if (amount <= 0 || referenceMax <= 0) {
    return min + (max - min) * BUBBLE_SIZE_VARIABLE_RATIO;
  }
  const ratio = Math.min(1, Math.max(0, amount / referenceMax));
  return min + (max - min) * Math.sqrt(ratio);
}

// Monto de referencia (percentil 95 de los montos positivos) para que un único
// outlier gigante no aplaste al resto contra el mínimo: el outlier clampea a max.
export function referenceAmount(amounts: number[]): number {
  const positive = amounts.filter((a) => a > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 0;
  const index = Math.floor(0.95 * (positive.length - 1));
  return positive[index];
}

export type Urgency = 'overdue' | 'dueSoon' | 'neutral';

// Urgencia de un vencimiento respecto a `now`.
// - Sin fecha -> neutral.
// - Vencido hace más de `severeDays` -> overdue (rojo).
// - Vencido hace <= `severeDays`, o por vencer dentro de `dueSoonDays` -> dueSoon (ámbar).
// - Vence más allá de la ventana -> neutral.
export function urgencyForDate(
  date: Date | undefined | null,
  now: Date,
  dueSoonDays: number,
  severeDays: number,
): Urgency {
  if (!date) return 'neutral';
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = (new Date(date).getTime() - now.getTime()) / dayMs; // <0 = vencido
  if (diffDays < -severeDays) return 'overdue';
  if (diffDays <= dueSoonDays) return 'dueSoon';
  return 'neutral';
}

export function urgencyRank(u: Urgency): number {
  return u === 'overdue' ? 2 : u === 'dueSoon' ? 1 : 0;
}

export function maxUrgency(urgencies: Urgency[]): Urgency {
  return urgencies.reduce<Urgency>(
    (acc, u) => (urgencyRank(u) > urgencyRank(acc) ? u : acc),
    'neutral',
  );
}
