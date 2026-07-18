import { Capacitor } from '@capacitor/core'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'

// True only on a device with enrolled fingerprint / face unlock
export async function isBiometricAvailable() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const r = await BiometricAuth.checkBiometry()
    return !!r.isAvailable
  } catch {
    return false
  }
}

// Resolves true only if the user passes the system biometric prompt.
// Throws / rejects on cancel or failure — caller falls back to PIN.
export async function biometricAuthenticate() {
  await BiometricAuth.authenticate({
    reason: 'Unlock Expense Tracker',
    cancelTitle: 'Use PIN',
    allowDeviceCredential: false,
    androidTitle: 'Unlock Expense Tracker',
    androidSubtitle: 'Use your fingerprint',
    androidConfirmationRequired: false,
  })
  return true
}
