import type { CustomIntervalUnit, RecurringFrequency, RecurringKind } from '@/db/queries/recurring-rules';

export type Rule = {
  id: number;
  sectionId: number;
  label: string;
  kind: RecurringKind;
  frequency: RecurringFrequency;
  customIntervalValue: number | null;
  customIntervalUnit: CustomIntervalUnit | null;
  isVariableAmount: boolean;
  estimatedAmount: number | null;
  nextDueDate: Date;
  reminderEnabled: boolean;
  createdAt: Date;
  previousRuleId: number | null;
};

export const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
];

export const CUSTOM_UNIT_OPTIONS: { value: CustomIntervalUnit; label: string }[] = [
  { value: 'days', label: 'Días' },
  { value: 'weeks', label: 'Semanas' },
];

export const createdAtFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export function frequencyDescription(rule: Rule): string | undefined {
  const option = FREQUENCY_OPTIONS.find((o) => o.value === rule.frequency);
  if (rule.frequency !== 'custom') {
    return option?.label;
  }
  const unitLabel = CUSTOM_UNIT_OPTIONS.find((u) => u.value === rule.customIntervalUnit)?.label;
  return `Cada ${rule.customIntervalValue ?? 1} ${(unitLabel ?? 'Días').toLowerCase()}`;
}
