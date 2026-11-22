// Remembers which row of the Add sheet was chosen last, to highlight it next time.
// Not secret: kept in the phone's secure storage like the other small settings, in memory on the web.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'moneyplanner.quickadd.last';
export const QUICK_ADD_DEFAULT = 'quick-add-one-time';

let cached: string | null = null;

export async function loadLastChoice(): Promise<string> {
  if (cached) return cached;
  try {
    if (Platform.OS !== 'web') cached = await SecureStore.getItemAsync(KEY);
  } catch {
    // Storage unavailable: use the default.
  }
  return cached ?? QUICK_ADD_DEFAULT;
}

export async function saveLastChoice(id: string): Promise<void> {
  cached = id;
  try {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(KEY, id);
  } catch {
    // The choice still holds for this session.
  }
}
