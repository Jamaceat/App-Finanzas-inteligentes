import { useEffect } from 'react';

import { computePendingConfirmations } from '@/db/queries/tanks';
import { resyncAllReminders, syncPendingConfirmationsDigest } from '@/lib/notifications';
import { useActiveRules, useAllRules, useTankTransactions } from '@/providers/app-data';

export function NotificationsSync() {
  const rules = useActiveRules();
  const allRules = useAllRules();
  const transactions = useTankTransactions();

  useEffect(() => {
    resyncAllReminders(rules);

    // El resumen diario solo cuenta reglas con recordatorio activo, igual que el
    // aviso puntual de syncRuleReminder (un solo control por regla, ver AGENTS.md).
    const reminderEnabledRuleIds = new Set(
      rules.filter((rule) => rule.reminderEnabled).map((rule) => rule.id),
    );
    const pending = [
      ...computePendingConfirmations(rules, 'income', { allRules, transactions }),
      ...computePendingConfirmations(rules, 'expense', { allRules, transactions }),
    ];
    const pendingCount = pending
      .filter((confirmation) => reminderEnabledRuleIds.has(confirmation.ruleId))
      .reduce((sum, confirmation) => sum + confirmation.occurrences.length, 0);

    syncPendingConfirmationsDigest(pendingCount);
  }, [rules, allRules, transactions]);

  return null;
}
