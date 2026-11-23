// Settings -> Backups & export: back up to a file, automatic backups, restore, CSV export and the monthly reminder.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, ListRow, Screen, T } from '@/components/ui';
import { useData } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { exportAllCsv, restoreBackupFromFile } from '@/data/backup';
import { backupBeforeChange, exportBackupAndRecord, formatBackupTime } from '@/data/backup/auto';
import { AutoBackupsSheet } from '@/features/backup/AutoBackupsSheet';
import { BackupReminderCard } from '@/features/backup/BackupReminderCard';
import { useBackupInfo } from '@/features/backup/useBackupInfo';

const showError = (title: string, e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));

export function BackupsScreen() {
  const { repo, bump } = useData();
  const { active } = useProfiles();
  const { meta: backupMeta, copies } = useBackupInfo();
  const [running, setRunning] = useState(false);
  const [copiesOpen, setCopiesOpen] = useState(false);

  const run = async (title: string, fn: () => Promise<void>) => {
    setRunning(true);
    try {
      await fn();
    } catch (e) {
      showError(title, e);
    } finally {
      setRunning(false);
    }
  };

  const restore = () =>
    run('Could not restore', async () => {
      const result = await restoreBackupFromFile(repo, (s) =>
        new Promise<boolean>((resolve) => {
          Alert.alert(
            'Replace everything with this backup?',
            `Backup from ${s.exportedAt.slice(0, 10)}: ${s.recurring} recurring items and ${s.transactions} one-time items.\n\nThis replaces everything now on this phone. A safety copy of your current data is saved first and kept for 7 days in Automatic backups.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              {
                text: 'Replace',
                style: 'destructive',
                onPress: () => {
                  // Save the current data first; if that fails the restore stops and nothing changes.
                  backupBeforeChange(repo, active.id, 'before-restore').then(() => resolve(true), (e) => { showError('Could not restore', e); resolve(false); });
                },
              },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        }),
      );
      bump();
      if (result === 'restored') Alert.alert('Backup restored', 'Your data has been replaced with the backup.');
    });

  return (
    <Screen testID="backups-screen">
      <Stack.Screen options={{ title: 'Backups & export' }} />
      <BackupReminderCard testID="settings-backup-reminder" />
      <Card>
        <T variant="caption" tone="secondary" testID="settings-data-note">
          {`Backup, restore and CSV export apply to ${active.name} only, not to the other profiles. To delete this profile and its data, use Manage profiles.`}
        </T>
        <Button label="Back up to a file" variant="secondary" disabled={running} onPress={() => run('Backup failed', () => exportBackupAndRecord(repo, active.id))} testID="settings-backup" />
        <ListRow
          title="Automatic backups"
          subtitle={
            backupMeta?.lastAutoAt
              ? `${formatBackupTime(backupMeta.lastAutoAt)} · ${copies.filter((c) => c.kind === 'daily').length} kept on this phone`
              : 'None yet. A copy is saved once a day.'
          }
          onPress={() => setCopiesOpen(true)}
          accessibilityLabel={`Automatic backups. ${backupMeta?.lastAutoAt ? `Last copy ${formatBackupTime(backupMeta.lastAutoAt)}` : 'None yet'}. Opens the list of copies`}
          testID="settings-auto-backups"
        />
        <Button label="Restore from a backup" variant="secondary" disabled={running} onPress={restore} testID="settings-restore" />
        <Button label="Export to spreadsheet (CSV)" variant="secondary" disabled={running} onPress={() => run('Export failed', () => exportAllCsv(repo))} testID="settings-export-csv" />
      </Card>
      <AutoBackupsSheet visible={copiesOpen} onClose={() => setCopiesOpen(false)} copies={copies} profileId={active.id} profileName={active.name} onRestored={bump} />
    </Screen>
  );
}
