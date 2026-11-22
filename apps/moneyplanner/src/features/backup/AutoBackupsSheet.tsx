// The automatic backups: last copy, the list of copies and "Restore this copy".
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, ListRow, Sheet, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { type AutoBackupInfo, formatBackupTime, restoreAutoBackup } from '@/data/backup/auto';
import { useData } from '@/data/DataProvider';
import { formatDate } from '@/lib/dates';

const KIND_LABEL = { daily: 'Automatic copy', 'before-restore': 'Safety copy before a restore', 'before-delete': 'Safety copy before deleting', 'deleted-profile': 'Kept for 7 days after deleting' } as const;

export function describeCopy(c: AutoBackupInfo, now = new Date()): { title: string; subtitle: string } {
  const kb = Math.max(1, Math.round(c.size / 1024));
  if (c.kind === 'daily') return { title: formatDate(c.date), subtitle: `${KIND_LABEL.daily} · ${kb} KB` };
  if (c.kind === 'deleted-profile') return { title: `Deleted profile ${c.profileName ?? ''}`.trim(), subtitle: `${formatBackupTime(c.date, now)} · ${KIND_LABEL[c.kind]} · ${kb} KB` };
  return { title: formatBackupTime(c.date, now), subtitle: `${KIND_LABEL[c.kind]} · ${kb} KB` };
}

export function AutoBackupsSheet({
  visible,
  onClose,
  copies,
  profileId,
  profileName,
  onRestored,
}: {
  visible: boolean;
  onClose: () => void;
  copies: AutoBackupInfo[];
  profileId: string;
  profileName: string;
  /** Called after a restore so the screen can reload its data. */
  onRestored: () => void;
}) {
  const { repo } = useData();
  const [busy, setBusy] = useState(false);

  const restore = (c: AutoBackupInfo) => {
    const { title } = describeCopy(c);
    Alert.alert(
      'Restore this copy?',
      `This replaces everything now in ${profileName} with ${c.kind === 'deleted-profile' ? `the copy of the deleted profile ${c.profileName ?? ''}` : `the copy from ${title}`}. A safety copy of your current data is saved first, so you can undo this from this list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await restoreAutoBackup(repo, c.uri, profileId);
              onRestored();
              onClose();
              Alert.alert('Copy restored', 'Your data has been replaced with that copy.');
            } catch (e) {
              Alert.alert('Could not restore', e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Automatic backups" testID="auto-backups-sheet">
      <T variant="caption" tone="secondary">
        {`Money Planner saves a copy of ${profileName} on this phone once a day and keeps the last 7. They are deleted if you uninstall the app, so also save a backup file now and then.`}
      </T>
      {copies.length === 0 ? (
        <T testID="auto-backups-empty">No automatic copies yet. The first one is saved the next time you open the app after setting up.</T>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {copies.map((c, i) => {
            const d = describeCopy(c);
            return (
              <View key={c.uri} style={{ gap: Spacing.one }}>
                <ListRow title={d.title} subtitle={d.subtitle} testID={`auto-backup-${i}`} />
                <Button
                  label={c.kind === 'deleted-profile' ? 'Restore into this profile' : 'Restore this copy'}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => restore(c)}
                  accessibilityHint={`Replaces your data with the copy from ${d.title}`}
                  testID={`auto-backup-restore-${i}`}
                />
              </View>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
