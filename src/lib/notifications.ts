import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { RecurringKind } from '@/db/queries/recurring-rules';

const CHANNEL_ID = 'finz-reminders';

// Merely importing 'expo-notifications' throws in Expo Go on Android (SDK 53+
// dropped remote-notification support there), so the module must be required
// lazily and only outside of Expo Go — a static top-level import would crash
// the whole import chain (_layout.tsx and anything else that pulls this file in).
const isExpoGo = Constants.appOwnership === 'expo';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsModule> | null = null;

async function loadNotificationsAsync(): Promise<NotificationsModule | null> {
  if (isExpoGo) {
    return null;
  }
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return Notifications;
    });
  }
  return notificationsModulePromise;
}

export function reminderIdentifier(ruleId: number): string {
  return `recurring-rule-${ruleId}`;
}

async function ensureNotificationSetupAsync(
  Notifications: NotificationsModule,
): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Recordatorios de FinZ',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) {
    return true;
  }

  const request = await Notifications.requestPermissionsAsync();
  return request.granted;
}

export type ReminderRule = {
  id: number;
  kind: RecurringKind;
  label: string;
  isVariableAmount: boolean;
  estimatedAmount: number | null;
  nextDueDate: Date;
  reminderEnabled: boolean;
};

// Vencimientos ya pasados se muestran como tarjetas "pendientes" en Home;
// no tiene sentido además dispararles una notificación al abrir la app.
export async function syncRuleReminder(rule: ReminderRule): Promise<void> {
  await cancelRuleReminder(rule.id);

  if (!rule.reminderEnabled || rule.nextDueDate.getTime() <= Date.now()) {
    return;
  }

  const Notifications = await loadNotificationsAsync();
  if (!Notifications) {
    return;
  }

  const granted = await ensureNotificationSetupAsync(Notifications);
  if (!granted) {
    return;
  }

  const verb = rule.kind === 'income' ? 'Ingreso pendiente de confirmar' : 'Gasto pendiente de confirmar';
  const amountHint = rule.isVariableAmount
    ? 'Monto variable'
    : rule.estimatedAmount != null
      ? `Estimado ${rule.estimatedAmount.toFixed(2)}`
      : undefined;

  await Notifications.scheduleNotificationAsync({
    identifier: reminderIdentifier(rule.id),
    content: {
      title: `${verb}: ${rule.label}`,
      body: amountHint ?? 'Vence hoy',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: rule.nextDueDate,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelRuleReminder(ruleId: number): Promise<void> {
  const Notifications = await loadNotificationsAsync();
  if (!Notifications) {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(reminderIdentifier(ruleId)).catch(() => undefined);
}

export async function resyncAllReminders(rules: ReminderRule[]): Promise<void> {
  await Promise.all(rules.map((rule) => syncRuleReminder(rule)));
}

const DIGEST_IDENTIFIER = 'pending-confirmations-digest';
const DIGEST_HOUR = 9;
const DIGEST_MINUTE = 0;

// Resumen diario mientras haya ciclos pendientes de confirmar (ver
// computePendingConfirmations en db/queries/tanks.ts). Se recalcula cada vez que
// cambian las reglas/transacciones (ver NotificationsSync); al no quedar
// pendientes simplemente se cancela en vez de reprogramarse.
export async function syncPendingConfirmationsDigest(count: number): Promise<void> {
  const Notifications = await loadNotificationsAsync();
  if (!Notifications) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER).catch(() => undefined);

  if (count <= 0) {
    return;
  }

  const granted = await ensureNotificationSetupAsync(Notifications);
  if (!granted) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: DIGEST_IDENTIFIER,
    content: {
      title: 'Tenés movimientos pendientes de confirmar',
      body: `${count} ${count === 1 ? 'movimiento' : 'movimientos'} esperando en Confirmar.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DIGEST_HOUR,
      minute: DIGEST_MINUTE,
      channelId: CHANNEL_ID,
    },
  });
}
