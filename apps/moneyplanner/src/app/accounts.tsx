// Money accounts (milestone 3b): the main account, other bank and cash accounts (Pro), and the cards from Debts.
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, DateField, EmptyState, MoneyField, Screen, SectionHeader, Segmented, SelectField, T, TextField, ToggleRow } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { usePlanInput, useRepoMutation } from '@/data/DataProvider';
import { useSettingSetter } from '@/data/useSettingSetter';
import { accountBalances, cardsOwed } from '@/engine';
import { buildAccount, canAddAccount, pickableAccounts, validateAccountName } from '@/features/accounts/helpers';
import { ScreenTitle } from '@/features/settings/ScreenTitle';
import { useTheme } from '@/hooks/use-theme';
import { today } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { usePro } from '@/lib/pro';
import { MAIN_ACCOUNT_ID, type Account, type AccountType, type Fils, type ISODate } from '@/types';

export const ACCOUNTS_PRO_TITLE = 'Pro comes with the next update';
const accountsPro = () => Alert.alert(ACCOUNTS_PRO_TITLE, 'More bank and cash accounts, choosing the account of each item and a default account come with Pro. Your main account, your cards and your debts stay free.');

type Editing = { mode: 'add' } | { mode: 'edit'; id: string } | null;
/** What a new item is: a bank or cash account here, or a card or debt (saved in Debts, so it is what you owe). */
type AddKind = AccountType | 'card' | 'loan';
const isDebtKind = (k: AddKind): k is 'card' | 'loan' => k === 'card' || k === 'loan';

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
  const [kind, setKind] = useState<AddKind>('bank');
  const [balance, setBalance] = useState<Fils | null>(null);
  const [overdrawn, setOverdrawn] = useState(false);
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
  const cards = cardsOwed(input, today());
  const editingAccount = editing?.mode === 'edit' ? accounts.find((a) => a.id === editing.id) : undefined;
  const editingMain = editing?.mode === 'edit' && editing.id === MAIN_ACCOUNT_ID;

  const open = (e: Editing) => {
    setEditing(e);
    setFormError(null);
    setFormKey((k) => k + 1);
    const a = e?.mode === 'edit' ? accounts.find((x) => x.id === e.id) : undefined;
    setName(e?.mode === 'edit' ? (e.id === MAIN_ACCOUNT_ID ? mainName : (a?.name ?? '')) : '');
    setType(a?.type ?? 'bank');
    setKind(isPro ? 'bank' : 'card');
    setBalance(a ? Math.abs(a.startingBalance) : null);
    setOverdrawn(!!a && a.startingBalance < 0);
    setDate(a?.startingBalanceDate ?? today());
  };

  const add = () => open({ mode: 'add' });
  const adding = editing?.mode === 'add';
  const addingDebt = adding && isDebtKind(kind);

  const submit = async () => {
    if (!editing || submitting.current) return;
    submitting.current = true;
    try {
      const problem = validateAccountName(name, mainName, accounts, editing.mode === 'edit' ? editing.id : undefined);
      if (adding && isDebtKind(kind)) {
        // Cards and debts are free; they are saved in Debts with their limit, rate and due day.
        setEditing(null);
        router.push(`/debts/new?type=${kind}`);
        return;
      }
      if (adding && !canAddAccount(isPro)) return accountsPro();
      if (problem) return setFormError(problem);
      if (editingMain) {
        if (await setSetting({ mainAccountName: name.trim() })) setEditing(null);
        return;
      }
      // An overdrawn account has a negative balance.
      const signed = (overdrawn ? -1 : 1) * Math.abs(balance ?? 0);
      if (editing.mode === 'add') await saveAccount(buildAccount({ name, type: kind as AccountType, balance: signed, date, existing: accounts, today: today() }));
      else if (editingAccount) await saveAccount({ ...editingAccount, name: name.trim(), type, startingBalance: signed, startingBalanceDate: date });
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
      <T tone="secondary">Your balance on Home is your bank and cash accounts minus what you owe on your cards. Add a credit card or a loan as what you owe, not as a bank account.</T>

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
      <Button label="Add an account, card or debt" onPress={add} testID="accounts-add" />

      <SectionHeader title="Cards" />
      <Card style={{ paddingVertical: Spacing.one }}>
        {cards.length === 0 ? (
          <T tone="secondary">No cards yet. A credit card is what you owe: add it with &quot;Add a credit card&quot;.</T>
        ) : (
          cards.map((d, n) => row(d.id, d.name, 'Card · owed today, off your balance', formatMoney(-d.owed, currency), () => router.push(`/debts/${d.id}`), n === cards.length - 1, `account-card-${d.id}`))
        )}
      </Card>
      <Button label="Add a credit card" variant="secondary" onPress={() => router.push('/debts/new?type=card')} testID="accounts-add-card" />

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
            <ScreenTitle variant="heading">{editing?.mode === 'add' ? 'Add an account, card or debt' : editingMain ? 'Main account' : 'Edit account'}</ScreenTitle>
            {adding ? (
              <SelectField
                label="What is it?"
                value={kind}
                options={[
                  { value: 'bank', label: isPro ? 'Bank or debit account' : 'Bank or debit account (Pro)' },
                  { value: 'cash', label: isPro ? 'Cash' : 'Cash (Pro)' },
                  { value: 'card', label: 'Credit card' },
                  { value: 'loan', label: 'Loan or other debt' },
                ]}
                onChange={(k) => setKind(k as AddKind)}
                testID="account-kind"
              />
            ) : null}
            {addingDebt ? (
              <T variant="caption" tone="secondary" testID="account-debt-note">
                {kind === 'card'
                  ? 'A credit card is money you owe: what it owes comes off your balance. Next you enter its limit, what it owes now and its due day.'
                  : 'A loan is money you owe. Next you enter what is left, the rate and the monthly payment.'}
              </T>
            ) : (
              <TextField label="Name" value={name} onChangeText={setName} error={formError} testID="account-name" />
            )}
            {addingDebt ? null : editingMain ? (
              <T variant="caption" tone="secondary">
                The main account&apos;s balance is the one you set on Home (tap the balance).
              </T>
            ) : (
              <>
                {adding ? null : (
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
                )}
                <MoneyField key={`b${formKey}`} label="Balance" value={balance} onChange={setBalance} currency={currency} hint="What the account had at the end of the date below." testID="account-balance" />
                <ToggleRow label="This account is overdrawn" value={overdrawn} onChange={setOverdrawn} testID="account-overdrawn" />
                <DateField key={`d${formKey}`} label="On" value={date} onChange={setDate} testID="account-date" />
              </>
            )}
            <Button label={addingDebt ? 'Continue' : 'Save'} onPress={submit} testID="account-save" />
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
