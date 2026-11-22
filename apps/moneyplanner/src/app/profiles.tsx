// Manage profiles: rename, recolour and delete any profile (typed confirmation).
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Button, Card, Screen, Sheet, T, TextField } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { PROFILE_NAME_MAX, MAX_PROFILES, type Profile } from '@/data/profiles/types';
import { ProfileForm } from '@/features/profiles/ProfileForm';
import { COLOR_NAMES } from '@/features/profiles/validate';

export default function ManageProfilesScreen() {
  const { profiles, active, updateProfile, deleteProfile } = useProfiles();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);

  return (
    <Screen testID="profiles-screen">
      <T tone="secondary">
        {`Each profile keeps its own plan, items, categories and settings. Up to ${MAX_PROFILES} profiles; names up to ${PROFILE_NAME_MAX} characters.`}
      </T>
      {profiles.map((p, i) => {
        const isActive = p.id === active.id;
        return (
          <Card key={p.id} testID={`profile-manage-${i}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <Avatar name={p.name} color={p.color} />
              <View style={{ flex: 1 }}>
                <T variant="heading" numberOfLines={1}>
                  {p.name}
                </T>
                <T variant="caption" tone="secondary">
                  {isActive ? `Open now · ${COLOR_NAMES[p.color] ?? 'Colour'}` : (COLOR_NAMES[p.color] ?? 'Colour')}
                </T>
              </View>
            </View>
            {editingId === p.id ? (
              <ProfileForm
                initialName={p.name}
                initialColor={Math.min(p.color, Palette.length - 1)}
                submitLabel="Save"
                onSubmit={async (name, color) => {
                  await updateProfile(p.id, { name, color });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                testIDPrefix={{ name: 'profile-edit-name-input', color: 'profile-edit-color', submit: 'profile-edit-save', cancel: 'profile-edit-cancel' }}
              />
            ) : (
              <View style={{ gap: Spacing.two }}>
                <Button label="Rename or change colour" accessibilityHint={`Edits ${p.name}`} variant="secondary" onPress={() => setEditingId(p.id)} testID={`profile-edit-${i}`} />
                <Button label={`Delete ${p.name}`} variant="destructive" onPress={() => setDeleting(p)} testID={`profile-delete-${i}`} />
              </View>
            )}
          </Card>
        );
      })}

      <DeleteSheet
        profile={deleting}
        profiles={profiles}
        isOpen={!!deleting && deleting.id === active.id}
        onClose={() => setDeleting(null)}
        onConfirm={async (p) => {
          try {
            await deleteProfile(p.id);
            setDeleting(null);
          } catch (e) {
            Alert.alert('Could not delete the profile', e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}

function DeleteSheet({ profile, profiles, isOpen, onClose, onConfirm }: { profile: Profile | null; profiles: Profile[]; isOpen: boolean; onClose: () => void; onConfirm: (p: Profile) => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setTyped('');
    onClose();
  };
  const matches = !!profile && typed.trim() === profile.name;
  return (
    <Sheet visible={!!profile} onClose={close} title={profile ? `Delete ${profile.name}?` : 'Delete profile'} testID="profile-delete-sheet">
      {profile ? (
        <View style={{ gap: Spacing.three }}>
          <T>{`All of ${profile.name}'s data is deleted from this phone: the plan, one-time items, categories, balance and settings. A safety copy is kept for 7 days in Automatic backups (Settings), where you can restore it into a profile.${profiles.length <= 1 ? ' This is your only profile: a new empty profile "Me" starts with the setup wizard.' : isOpen ? ' This profile is open now, so another profile opens afterwards.' : ''}`}</T>
          <TextField label={`Type "${profile.name}" to confirm`} value={typed} onChangeText={setTyped} testID="profile-delete-input" />
          <Button
            label="Delete profile and all its data"
            variant="destructive"
            disabled={!matches || busy}
            onPress={async () => {
              setBusy(true);
              await onConfirm(profile);
              setTyped('');
              setBusy(false);
            }}
            testID="profile-delete-confirm"
          />
          <Button label="Cancel" variant="plain" onPress={close} testID="profile-delete-cancel" />
        </View>
      ) : null}
    </Sheet>
  );
}
