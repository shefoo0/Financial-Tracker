// A gentle monthly reminder to save a backup file. Renders nothing unless 30 days have passed
// without a saved backup file (and "Later" wasn't tapped in the last 30 days).
import { View } from 'react-native';

import { Button, Card, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useBackupReminder } from './useBackupInfo';

export function BackupReminderCard({ testID = 'backup-reminder' }: { testID?: string }) {
  const { due, busy, saveNow, later } = useBackupReminder();
  if (!due) return null;
  return (
    <Card testID={testID}>
      <T variant="heading" accessibilityRole="header">
        Keep your data safe
      </T>
      <T tone="secondary">Save a backup file to keep your data safe if you change phones.</T>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Button label="Save now" onPress={saveNow} disabled={busy} accessibilityHint="Opens the share sheet to save a backup file" testID={`${testID}-save`} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Later" variant="secondary" onPress={later} disabled={busy} accessibilityHint="Reminds you again in 30 days" testID={`${testID}-later`} />
        </View>
      </View>
    </Card>
  );
}
