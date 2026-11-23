// Money accounts (milestone 3b): the main account, other bank and cash accounts (Pro), and the cards from Debts.
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, EmptyState, MoneyField, Screen, SectionHeader, Segmented, SelectField, T, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { usePlanInput, useRepoMutation } from '@/data/DataProvider';
import { useSettingSetter } from '@/data/useSettingSetter';
import { accountBalances, remainingOf } from '@/engine';
import { buildAccount, canAddAccount, pickableAccounts, validateAccountName } from '@/features/accounts/helpers';
import { ScreenTitle } from '@/features/settings/ScreenTitle';
import { useTheme } from '@/hooks/use-theme';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { usePro } from '@/lib/pro';
import { MAIN_ACCOUNT_ID, type Account, type AccountType, type CreditCard, type Fils, type ISODate } from '@/types';

export const ACCOUNTS_PRO_TITLE = 'Pro comes with the next update';
const accountsPro = () => Alert.alert(ACCOUNTS_PRO_TITLE, 'More bank and cash accounts, choosing the account of each item and a default account come with Pro. Your main account and your cards stay free.');

type Editing = { mode: 'add' } | { mode: 'edit'; id: string } | null;

export default function Accounts() {
  const c = useTheme();
  const { isPro } = usePro();
  const { data: input, error, reload } = usePlanInput();
  const saveAccount = useRepoMutation((r, a: Account) => r.upsertAccount(a));
  const removeAccount = useRepoMutation((r, id: string) => r.removeAccount(id));
  const { set: setSetting } = useSettingSetter();
  const submitting = useRef(false);

  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [balance, setBalance] = useState<Fils | null>(null);
  const [date, setDate] = useState<ISODate>(today());
  const [formKey, setFormKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  if (error || !input) {
    return (
      <Screen testID="accounts-screen">
        <Stack.Screen options={{ title: 'Accounts' }} />
        {error ? <EmptyState title="Could not load your accounts" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="accounts-retry" />} /> : <T tone="secondary">Loading…</T>}
      </Screen>
    );
  }

  const settings = input.settings;
  const currency = settings.currency;
  const mainName = settings.mainAccountName ?? 'Main account';
  const accounts = input.accounts ?? [];
  const balances = accountBalances(input, today());
  const cards = input.debts.filter((d): d is CreditCard => d.type === 'card' && !d.archived);
  const editingAccount = editing?.mode === 'edit' ? accounts.find((a) => a.id === editing.id) : undefined;
  const editingMain = editing?.mode === 'edit' && editing.id === MAIN_ACCOUNT_ID;

  const open = (e: Editing) => {
    setEditing(e);
    setFormError(null);
    setFormKey((k) => k + 1);
    const a = e?.mode === 'edit' ? accounts.find((x) => x.id === e.id) : undefined;
    setName(e?.mode === 'edit' ? (e.id === MAIN_ACCOUNT_ID ? mainName : (a?.name ?? '')) : '');
    setType(a?.type ?? 'bank');
    setBalance(a ? a.startingBalance : null);
    setDate(a?.startingBalanceDate ?? today());
  };

  const add = () => (canAddAccount(isPro) ? open({ mode: 'add' }) : accountsPro());

  const submit = async () => {
    if (!editing || submitting.current) return;
    submitting.current = true;
    try {
      const problem = validateAccountName(name, mainName, accounts, editing.mode === 'edit' ? editing.id : undefined);
      if (problem) return setFormError(problem);
      if (editingMain) {
        if (await setSetting({ mainAccountName: name.trim() })) setEditing(null);
        return;
      }
      if (editing.mode === 'add') await saveAccount(buildAccount({ name, type, balance: balance ?? 0, date, existing: accounts, today: today() }));
      else if (editingAccount) await saveAccount({ ...editingAccount, name: name.trim(), type, startingBalance: Math.max(0, balance ?? 0), startingBalanceDate: date });
      setEditing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      submitting.current = false;
    }
  };

  const confirmRemove = (a: Account) => {
    Alert.alert(`Remove "${a.name}"?`, 'If items already use this account, it is closed: hidden from new choices, and old items keep it. Otherwise it is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAccount(a.id);
            if (settings.defaultAccountId === a.id) await setSetting({ defaultAccountId: null });
            setEditing(null);
          } catch (e) {
            Alert.alert('Could not remove', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const row = (key: string, title: string, sub: string, value: string, onPress: () => void, last: boolean, testID: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}, ${value}`}
      testID={testID}
      style={({ pressed }) => [styles.row, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: c.backgroundSelected }]}>
      <View style={{ flex: 1 }}>
        <T numberOfLines={2}>{title}</T>
        <T variant="caption" tone="secondary">
          {sub}
        </T>
      </View>
      <T variant="label" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      <T tone="secondary">›</T>
    </Pressable>
  );

  const open_ = balances.filter((b) => !b.archived);
  const closed = balances.filter((b) => b.archived);
  const pickable = pickableAccounts(mainName, accounts);

  return (
    <Screen testID="accounts-screen">
      <Stack.Screen options={{ title: 'Accounts' }} />
      <T tone="secondary">Your balance on Home is the total of your bank and cash accounts. Cards are what you owe: their purchases are spending, and the bank pays them on their due date.</T>

      <SectionHeader title="Bank and cash" />
      <Card style={{ paddingVertical: Spacing.one }}>
        {open_.map((b, n) =>
          row(
            b.id,
            b.name,
            b.id === MAIN_ACCOUNT_ID ? 'Main account · its balance is set on Home' : accounts.find((a) => a.id === b.id)?.type === 'cash' ? 'Cash' : 'Bank account',
            formatMoney(b.balance, currency),
            () => open({ mode: 'edit', id: b.id }),
            n === open_.length - 1,
            `account-${b.id}`,
          ),
        )}
      </Card>
      <Button label={isPro ? 'Add an account' : 'Add an account (Pro)'} variant={isPro ? 'primary' : 'secondary'} onPress={add} testID="accounts-add" />

      <SectionHeader title="Cards" />
      <Card style={{ paddingVertical: Spacing.one }}>
        {cards.length === 0 ? (
          <T tone="secondary">No cards yet. Add a credit card in Debts on the Plan tab.</T>
        ) : (
          cards.map((d, n) => row(d.id, d.name, 'Card · owed today', formatMoney(remainingOf(d, input), currency), () => router.push(`/debts/${d.id}`), n === cards.length - 1, `account-card-${d.id}`))
        )}
      </Card>

      <SectionHeader title="New items" />
      <Card>
        {isPro ? (
          <SelectField
            label="Default account for new items"
            value={pickable.some((p) => p.id === settings.defaultAccountId) ? (settings.defaultAccountId as string) : MAIN_ACCOUNT_ID}
            options={pickable.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(id) => setSetting({ defaultAccountId: id === MAIN_ACCOUNT_ID ? null : id })}
            testID="accounts-default"
          />
        ) : (
          <Pressable onPress={accountsPro} accessibilityRole="button" testID="accounts-default-locked">
            <T>{`New items go into ${mainName}.`}</T>
            <T variant="caption" tone="secondary">
              Choosing the account of each item, and a default account, come with Pro.
            </T>
          </Pressable>
        )}
      </Card>

      {closed.length > 0 ? (
        <>
          <SectionHeader title="Closed" />
          <Card style={{ paddingVertical: Spacing.one }}>
            {closed.map((b, n) => row(b.id, b.name, 'Closed · kept for old items', formatMoney(b.balance, currency), () => open({ mode: 'edit', id: b.id }), n === closed.length - 1, `account-${b.id}`))}
          </Card>
        </>
      ) : null}

      <Modal visible={editing != null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: c.scrimLight, justifyContent: 'center', padding: Spacing.three }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: c.backgroundElement, borderColor: c.glassBorder }]}>
            <ScreenTitle variant="heading">{editing?.mode === 'add' ? 'New account' : editingMain ? 'Main account' : 'Edit account'}</ScreenTitle>
            <TextField label="Name" value={name} onChangeText={setName} error={formError} testID="account-name" />
            {editingMain ? (
              <T variant="caption" tone="secondary">
                The main account&apos;s balance is the one you set on Home (tap the balance).
              </T>
            ) : (
              <>
                <Segmented
                  label="Type"
                  value={type}
                  onChange={setType}
                  options={[
                    { value: 'bank', label: 'Bank account' },
                    { value: 'cash', label: 'Cash' },
                  ]}
                  testID="account-type"
                />
                <MoneyField key={`b${formKey}`} label="Balance" value={balance} onChange={setBalance} currency={currency} hint="What the account had at the end of the date below." testID="account-balance" />
                <DateField key={`d${formKey}`} label="On" value={date} onChange={setDate} testID="account-date" />
              </>
            )}
            <Button label="Save" onPress={submit} testID="account-save" />
            {editingAccount ? <Button label={editingAccount.archived ? 'Delete if unused' : 'Remove account'} variant="destructive" onPress={() => confirmRemove(editingAccount)} testID="account-remove" /> : null}
            {editingAccount?.archived ? <Button label="Open again" variant="secondary" onPress={() => saveAccount({ ...editingAccount, archived: false }).then(() => setEditing(null))} testID="account-reopen" /> : null}
            <Button label="Cancel" variant="plain" onPress={() => setEditing(null)} testID="account-cancel" />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 60, paddingVertical: Spacing.two },
  sheet: { borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.three, gap: Spacing.three, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
