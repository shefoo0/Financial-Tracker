// The profile switcher: profiles, add, manage and the appearance switch.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { Avatar, Button, Sheet, T } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { MAX_PROFILES } from '@/data/profiles/types';
import { useTheme } from '@/hooks/use-theme';
import { AppearanceSetting } from './AppearanceSetting';
import { ProfileForm } from './ProfileForm';
import { nextColor } from './validate';

export function ProfileSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const router = useRouter();
  const { profiles, active, switchProfile, addProfile } = useProfiles();
  const [adding, setAdding] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const close = () => {
    setAdding(false);
    onClose();
  };

  const open = async (id: string) => {
    if (id === active.id) {
      close();
      return;
    }
    if (switchingId) return;
    setSwitchingId(id);
    try {
      await switchProfile(id);
      close();
    } catch (e) {
      Alert.alert('Could not switch profile', e instanceof Error ? e.message : String(e));
    } finally {
      setSwitchingId(null);
    }
  };

  const full = profiles.length >= MAX_PROFILES;

  return (
    <Sheet visible={visible} onClose={close} title="Profiles" testID="profile-sheet">
      {adding ? (
        <View style={{ gap: Spacing.three }}>
          <T variant="label">New profile</T>
          <T variant="caption" tone="secondary">
            It has its own plan, items and settings, and starts with the setup wizard.
          </T>
          <ProfileForm
            initialColor={nextColor(profiles.map((p) => p.color), Palette.length)}
            submitLabel="Create"
            onSubmit={async (name, color) => {
              await addProfile(name, color);
              close();
            }}
            onCancel={() => setAdding(false)}
            testIDPrefix={{ name: 'profile-name-input', color: 'profile-color', submit: 'profile-create', cancel: 'profile-add-cancel' }}
          />
        </View>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {profiles.map((p, i) => {
            const isActive = p.id === active.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => open(p.id)}
                accessibilityRole="button"
                accessibilityLabel={isActive ? `${p.name}, open now` : `Switch to ${p.name}`}
                accessibilityState={{ selected: isActive, busy: switchingId === p.id }}
                testID={`profile-row-${i}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.three,
                  minHeight: 64,
                  padding: Spacing.three,
                  borderRadius: Radius.md,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? c.accent : c.glassBorder,
                  backgroundColor: pressed ? c.backgroundSelected : c.glass,
                })}>
                <Avatar name={p.name} color={p.color} />
                <View style={{ flex: 1 }}>
                  <T variant="heading" numberOfLines={1}>
                    {p.name}
                  </T>
                  {isActive ? (
                    <T variant="caption" tone="secondary">
                      Open now
                    </T>
                  ) : null}
                </View>
                {switchingId === p.id ? (
                  <ActivityIndicator color={c.accent} accessibilityLabel="Switching" />
                ) : isActive ? (
                  <T tone="accent" variant="heading" accessibilityLabel="Selected">
                    ✓
                  </T>
                ) : null}
              </Pressable>
            );
          })}

          {full ? (
            <T variant="caption" tone="secondary" testID="profile-limit-note">
              {`You have ${MAX_PROFILES} profiles, the most this app allows. Delete one to add another.`}
            </T>
          ) : (
            <Button label="+ Add profile" variant="secondary" onPress={() => setAdding(true)} disabled={!!switchingId} testID="profile-add" />
          )}
          <Button
            label="Manage profiles"
            variant="plain"
            onPress={() => {
              close();
              router.push('/profiles');
            }}
            testID="profile-manage"
          />

          <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
            <T variant="label" tone="secondary">
              Appearance
            </T>
            <AppearanceSetting />
          </View>
        </View>
      )}
    </Sheet>
  );
}
