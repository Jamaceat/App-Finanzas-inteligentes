import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect } from 'react';

import { listActiveRecurringRules } from '@/db/queries/recurring-rules';
import { resyncAllReminders } from '@/lib/notifications';

export function NotificationsSync() {
  const { data: rules } = useLiveQuery(listActiveRecurringRules());

  useEffect(() => {
    resyncAllReminders(rules);
  }, [rules]);

  return null;
}
