// Thin wrapper over expo-notifications for LOCAL notifications only (no push
// tokens, no servers). On the web preview everything is a no-op.
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

export const CHANNEL_ID = 'money-alerts';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface Permission {
  state: PermissionState;
  /** False once the system will no longer show the permission prompt. */
  canAskAgain: boolean;
}

const supported = () => Platform.OS !== 'web';

function toPermission(p: { granted: boolean; canAskAgain: boolean; status: string }): Permission {
  if (p.granted) return { state: 'granted', canAskAgain: p.canAskAgain };
  return { state: p.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: p.canAskAgain };
}

/** Android needs a channel before anything can be shown (and before the Android 13 prompt). */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Money alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getPermission(): Promise<Permission> {
  if (!supported()) return { state: 'unsupported', canAskAgain: false };
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return { state: 'denied', canAskAgain: false };
  }
}

/** Shows the system prompt. Call only after the explainer. */
export async function requestPermission(): Promise<Permission> {
  if (!supported()) return { state: 'unsupported', canAskAgain: false };
  try {
    await ensureChannel();
    return toPermission(await Notifications.requestPermissionsAsync());
  } catch {
    return { state: 'denied', canAskAgain: false };
  }
}

export async function cancelAll(): Promise<void> {
  if (!supported()) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleAt(at: Date, title: string, body: string, data: Record<string, unknown>): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
  });
}

/** Show notifications that arrive while the app is open. */
export function installForegroundHandler() {
  if (!supported()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** The current permission, re-read when the app returns to the foreground (e.g. from system settings). */
export function usePermission(): { permission: Permission | null; refresh: () => void } {
  const [permission, setPermission] = useState<Permission | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getPermission().then((p) => !cancelled && setPermission(p));
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNonce((n) => n + 1));
    return () => sub.remove();
  }, []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { permission, refresh };
}
