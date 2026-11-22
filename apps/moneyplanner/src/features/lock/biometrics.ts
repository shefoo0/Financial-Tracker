// Face ID / fingerprint through expo-local-authentication. Never throws.
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/** True when the phone has biometrics and the user has enrolled one. */
export async function biometricsAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(profileName: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: `Unlock ${profileName}`,
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    return r.success;
  } catch {
    return false;
  }
}
