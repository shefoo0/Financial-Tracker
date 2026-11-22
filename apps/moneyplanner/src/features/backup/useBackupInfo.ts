// What the backup screens need: the automatic copies, the reminder state and its actions.
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  type AutoBackupInfo,
  type BackupMeta,
  ensureReminderStarted,
  exportBackupAndRecord,
  isReminderDue,
  listAutoBackups,
  onBackupChange,
  readBackupMeta,
  snoozeBackupReminder,
} from '@/data/backup/auto';
import { useData } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';

export function useBackupInfo() {
  const { active } = useProfiles();
  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [copies, setCopies] = useState<AutoBackupInfo[]>([]);
  const profileId = active.id;

  useEffect(() => {
    let alive = true;
    const load = () =>
      readBackupMeta(profileId).then((m) => {
        if (!alive) return;
        setMeta(m);
        setCopies(listAutoBackups(profileId));
      });
    ensureReminderStarted(profileId).then(() => load());
    const off = onBackupChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, [profileId]);

  return { meta, copies, profileId };
}

/** The monthly "save a backup file" reminder shared by Settings and Home. */
export function useBackupReminder() {
  const { repo } = useData();
  const { meta, profileId } = useBackupInfo();
  const [busy, setBusy] = useState(false);
  const due = meta ? isReminderDue(meta, new Date()) : false;

  const saveNow = async () => {
    setBusy(true);
    try {
      await exportBackupAndRecord(repo, profileId);
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const later = () => snoozeBackupReminder(profileId);
  return { due, busy, saveNow, later };
}
