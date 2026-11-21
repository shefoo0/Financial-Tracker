// System / Light / Dark switch, saved on the device by the profile provider.
import { Alert } from 'react-native';

import { Segmented } from '@/components/ui';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import type { Appearance } from '@/data/profiles/types';

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSetting({ testID = 'appearance-segmented' }: { testID?: string }) {
  const { appearance, setAppearance } = useProfiles();
  return (
    <Segmented
      label="Appearance"
      options={OPTIONS}
      value={appearance}
      onChange={(v) => {
        setAppearance(v).catch((e) => Alert.alert('Could not change the appearance', e instanceof Error ? e.message : String(e)));
      }}
      testID={testID}
    />
  );
}
