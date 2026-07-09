import { useEffect } from 'react';

import { resyncAllReminders } from '@/lib/notifications';
import { useActiveRules } from '@/providers/app-data';

export function NotificationsSync() {
  const rules = useActiveRules();

  useEffect(() => {
    resyncAllReminders(rules);
  }, [rules]);

  return null;
}
