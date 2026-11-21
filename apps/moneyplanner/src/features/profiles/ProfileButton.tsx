// Glass pill with the active profile's avatar and name; opens the switcher.
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Avatar, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { useTheme } from '@/hooks/use-theme';
import { ProfileSwitcherSheet } from './ProfileSwitcherSheet';

export function ProfileButton({ testID = 'profile-button' }: { testID?: string }) {
  const c = useTheme();
  const { active } = useProfiles();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Profile: ${active.name}. Switch profile`}
        testID={testID}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.two,
          minHeight: 44,
          maxWidth: 200,
          paddingVertical: Spacing.one,
          paddingLeft: Spacing.one,
          paddingRight: Spacing.three,
          borderRadius: Radius.pill,
          borderWidth: 1,
          borderColor: c.glassBorder,
          backgroundColor: pressed ? c.backgroundSelected : c.glass,
        })}>
        <Avatar name={active.name} color={active.color} size={36} />
        <T variant="label" numberOfLines={1} style={{ flexShrink: 1 }} maxFontSizeMultiplier={1.4}>
          {active.name}
        </T>
        <T variant="caption" tone="secondary">
          ▾
        </T>
      </Pressable>
      <ProfileSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
