// Categories: add, rename and remove. Removing one that is in use archives it.
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, IconBadge, MoneyField, Screen, SectionHeader, Segmented, T, TextField } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useData, useRepoMutation, useRepoQuery } from '@/data/DataProvider';
import { ScreenTitle } from '@/features/settings/ScreenTitle';
import { activeCategories, buildCategory, validateCategoryName } from '@/features/settings/helpers';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import type { Category, Fils, Kind } from '@/types';

type Editing = { mode: 'add' } | { mode: 'edit'; category: Category } | null;

export default function Categories() {
  const c = useTheme();
  const { repo } = useData();
  const submitting = useRef(false);
  const { data: settings } = useRepoQuery((r) => r.getSettings());
  const currency = settings?.currency ?? 'AED';
  const { data: all, error, loading, reload } = useRepoQuery((r) => r.listCategories());
  const save = useRepoMutation((r, cat: Category) => r.upsertCategory(cat));
  const remove = useRepoMutation((r, id: string) => r.removeCategory(id));

  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('cost');
  const [limit, setLimit] = useState<Fils | null>(null);
  const [limitKey, setLimitKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (e: Editing) => {
    setEditing(e);
    setFormError(null);
    setLimitKey((k) => k + 1);
    if (e?.mode === 'edit') {
      setName(e.category.name);
      setKind(e.category.kind);
      setLimit(e.category.monthlyLimit ?? null);
    } else {
      setName('');
      setKind('cost');
      setLimit(null);
    }
  };

  const submit = async () => {
    if (!editing || !all || submitting.current) return;
    submitting.current = true;
    try {
      // Check against fresh data, in case another save landed since the list loaded.
      const fresh = await repo.listCategories();
      const problem = validateCategoryName(name, fresh, kind, editing.mode === 'edit' ? editing.category.id : undefined);
      if (problem) {
        setFormError(problem);
        return;
      }
      const monthlyLimit = kind === 'cost' && limit != null && limit > 0 ? limit : null;
      if (editing.mode === 'add') await save({ ...buildCategory(name, kind, fresh), monthlyLimit });
      else await save({ ...editing.category, name: name.trim(), monthlyLimit: editing.category.kind === 'cost' ? monthlyLimit : null });
      setEditing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      submitting.current = false;
    }
  };

  const confirmRemove = (cat: Category) => {
    Alert.alert(`Remove "${cat.name}"?`, 'If items already use this category, it is hidden from new choices but old items keep their label. Otherwise it is deleted.', [
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
    ]);
  };

  const group = (title: string, k: Kind) => {
    const list = activeCategories(all ?? [], k);
    return (
      <View>
        <SectionHeader title={title} />
        <Card style={{ paddingVertical: Spacing.one }}>
          {list.length === 0 ? (
            <T tone="secondary">{`No ${title.toLowerCase()} categories yet.`}</T>
          ) : (
            list.map((cat, n) => (
              <Pressable
                key={cat.id}
                onPress={() => open({ mode: 'edit', category: cat })}
                accessibilityRole="button"
                accessibilityLabel={`${cat.name}, ${title} category${cat.monthlyLimit ? `, monthly limit ${formatMoney(cat.monthlyLimit, currency)}` : ''}. Tap to edit or remove`}
                testID={`category-${cat.id}`}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Spacing.three,
                    minHeight: 60,
                    paddingVertical: Spacing.two,
                  },
                  n < list.length - 1 && {
                    borderBottomColor: c.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                  pressed && { backgroundColor: c.backgroundSelected },
                ]}
              >
                <IconBadge
                  glyph={k === 'income' ? '↓' : '↑'}
                  color={
                    Palette[
                      Math.max(
                        0,
                        (all ?? []).findIndex((x) => x.id === cat.id),
                      ) % Palette.length
                    ]
                  }
                />
                <View style={{ flex: 1 }}>
                  <T numberOfLines={2}>{cat.name}</T>
                  <T variant="caption" tone="secondary" testID={`category-limit-${cat.id}`}>
                    {cat.monthlyLimit ? `Limit ${formatMoney(cat.monthlyLimit, currency)} a month` : k === 'cost' ? 'No monthly limit' : 'Tap to rename or remove'}
                  </T>
                </View>
                <T tone="secondary">›</T>
              </Pressable>
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
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            padding: Spacing.three,
          }}
        >
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
            onPress={() => setEditing(null)}
            accessibilityLabel="Close"
          />
          <View
            style={{
              backgroundColor: c.backgroundElement,
              borderColor: c.glassBorder,
              borderWidth: 1,
              borderRadius: Radius.xl,
              padding: Spacing.three,
              gap: Spacing.three,
              maxWidth: 480,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <ScreenTitle variant="heading">{editing?.mode === 'edit' ? 'Edit category' : 'New category'}</ScreenTitle>
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
            {(editing?.mode === 'add' ? kind === 'cost' : editing?.category.kind === 'cost') && (
              <MoneyField
                key={limitKey}
                label="Monthly limit (optional)"
                value={limit}
                onChange={setLimit}
                currency={currency}
                hint="Shows spent and left on the Month screen. Leave empty for no limit."
                testID="category-limit-input"
              />
            )}
            <Button label="Save" onPress={submit} testID="category-save" />
            {editing?.mode === 'edit' && <Button label="Remove category" variant="destructive" onPress={() => confirmRemove(editing.category)} testID="category-remove" />}
            <Button label="Cancel" variant="plain" onPress={() => setEditing(null)} testID="category-cancel" />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
