import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const REMINDER_ID = 9001

export function isNotificationsSupported() {
  return Capacitor.isNativePlatform()
}

export async function enableDailyReminder() {
  if (!isNotificationsSupported()) return false
  const perm = await LocalNotifications.requestPermissions()
  if (perm.display !== 'granted') return false

  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'Expense Tracker 💸',
        body: "Did you log today's expenses? Tap to add them before you forget.",
        schedule: {
          on: { hour: 21, minute: 0 },
          allowWhileIdle: true,
        },
        smallIcon: 'ic_stat_rupee',
        iconColor: '#D9481C',
      },
    ],
  })
  return true
}

export async function disableDailyReminder() {
  if (!isNotificationsSupported()) return
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] })
}
