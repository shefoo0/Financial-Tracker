// Categories: add, rename and remove. Removing one that is in use archives it.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';

import { Button, Card, EmptyState, ListRow, Screen, SectionHeader, Segmented, T, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRepoMutation, useRepoQuery } from '@/data/DataProvider';
import { activeCategories, buildCategory, validateCategoryName } from '@/features/settings/helpers';
import { useTheme } from '@/hooks/use-theme';
import type { Category, Kind } from '@/types';

type Editing = { mode: 'add' } | { mode: 'edit'; category: Category } | null;

export default function Categories() {
  const c = useTheme();
  const { data: all, error, loading, reload } = useRepoQuery((r) => r.listCategories());
  const save = useRepoMutation((r, cat: Category) => r.upsertCategory(cat));
  const remove = useRepoMutation((r, id: string) => r.removeCategory(id));

  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('cost');
  const [formError, setFormError] = useState<string | null>(null);

  const open = (e: Editing) => {
    setEditing(e);
    setFormError(null);
    if (e?.mode === 'edit') {
      setName(e.category.name);
      setKind(e.category.kind);
    } else {
      setName('');
      setKind('cost');
    }
  };

  const submit = async () => {
    if (!editing || !all) return;
    const problem = validateCategoryName(name, all, kind, editing.mode === 'edit' ? editing.category.id : undefined);
    if (problem) {
      setFormError(problem);
      return;
    }
    try {
      if (editing.mode === 'add') await save(buildCategory(name, kind, all));
      else await save({ ...editing.category, name: name.trim() });
      setEditing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmRemove = (cat: Category) => {
    Alert.alert(
      `Remove "${cat.name}"?`,
      'If items already use this category, it is hidden from new choices but old items keep their label. Otherwise it is deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(cat.id);
              setEditing(null);
            } catch (e) {
              Alert.alert('Could not remove', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const group = (title: string, k: Kind) => {
    const list = activeCategories(all ?? [], k);
    return (
      <View>
        <SectionHeader title={title} />
        <Card>
          {list.length === 0 ? (
            <T tone="secondary">{`No ${title.toLowerCase()} categories yet.`}</T>
          ) : (
            list.map((cat) => (
              <ListRow
                key={cat.id}
                title={cat.name}
                subtitle="Tap to rename or remove"
                onPress={() => open({ mode: 'edit', category: cat })}
                accessibilityLabel={`${cat.name}, ${title} category. Tap to rename or remove`}
                testID={`category-${cat.id}`}
              />
            ))
          )}
        </Card>
      </View>
    );
  };

  return (
    <Screen testID="categories-screen">
      <Stack.Screen options={{ title: 'Categories' }} />
      {error ? (
        <EmptyState title="Could not load categories" message={error.message} action={<Button label="Try again" onPress={reload} testID="categories-retry" />} />
      ) : !all ? (
        <T tone="secondary">{loading ? 'Loading…' : ''}</T>
      ) : (
        <>
          <Button label="Add a category" onPress={() => open({ mode: 'add' })} testID="categories-add" />
          {group('Income', 'income')}
          {group('Costs', 'cost')}
        </>
      )}

      <Modal visible={editing != null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.three }}>
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => setEditing(null)} accessibilityLabel="Close" />
          <View style={{ backgroundColor: c.background, borderRadius: 14, padding: Spacing.three, gap: Spacing.three, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
            <T variant="heading">{editing?.mode === 'edit' ? 'Rename category' : 'New category'}</T>
            <TextField label="Name" value={name} onChangeText={setName} error={formError} testID="category-name" />
            {editing?.mode === 'add' && (
              <Segmented
                label="Type"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'income', label: 'Income' },
                  { value: 'cost', label: 'Cost' },
                ]}
                testID="category-kind"
              />
            )}
            <Button label="Save" onPress={submit} testID="category-save" />
            {editing?.mode === 'edit' && (
              <Button label="Remove category" variant="destructive" onPress={() => confirmRemove(editing.category)} testID="category-remove" />
            )}
            <Button label="Cancel" variant="plain" onPress={() => setEditing(null)} testID="category-cancel" />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
