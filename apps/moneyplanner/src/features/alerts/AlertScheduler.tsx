// Keeps this app's local notifications in step with the open profile's alerts.
// Renders nothing. Mount it once inside <DataProvider> (the profile provider
// does that), so a profile switch unmounts it and clears the old profile's
// notifications.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { usePlanInput } from '@/data/DataProvider';
import { buildAlerts } from '@/engine';
import { cancelAll, getPermission, installForegroundHandler, scheduleAt, ensureChannel } from './notifications';
import { planNotifications } from './plan';
import { useDay } from './useDay';

const DEBOUNCE_MS = 1000;

// Runs one sync at a time so two overlapping reschedules can't interleave.
let queue: Promise<unknown> = Promise.resolve();

export function AlertScheduler() {
  const { data } = usePlanInput();
  const day = useDay();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    installForegroundHandler();
    // The user may grant or revoke permission in system settings.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNonce((n) => n + 1));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      queue = queue
        .then(async () => {
          if (cancelled) return;
          const permission = await getPermission();
          if (cancelled) return;
          if (!data.settings.enabledModules.alerts || permission.state !== 'granted') {
            await cancelAll();
            return;
          }
          const planned = planNotifications(buildAlerts(data, day), data.settings.lockEnabled, new Date());
          await ensureChannel();
          await cancelAll();
          for (const n of planned) {
            if (cancelled) return;
            await scheduleAt(n.at, n.title, n.body, { alertId: n.alertId });
          }
        })
        .catch(() => undefined); // notifications are best effort; the in-app list still works
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data, day, nonce]);

  // Profile switch (or leaving the app tree): clear this profile's notifications.
  useEffect(
    () => () => {
      queue = queue.then(() => cancelAll()).catch(() => undefined);
    },
    [],
  );

  return null;
}
