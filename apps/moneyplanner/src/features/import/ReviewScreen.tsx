// /import/review: every row the reader found, grouped by day, before anything is saved.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground, Button, Card, DateField, EmptyState, Pill, Screen, ScreenHeader, Sheet, T } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useRepoMutation, useRepoQuery } from '@/data/DataProvider';
import { useTheme } from '@/hooks/use-theme';
import { learnRule, type CategoryRule } from '@/import/parse';
import { formatDate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney, formatMoneyTrim } from '@/lib/money';
import { usePro } from '@/lib/pro';
import type { Category, ImportRecord, ImportTemplate, Transaction } from '@/types';

import { ImportProLocked } from './ProLocked';
import {
  applyCategoryToSimilar,
  buildReviewRows,
  flipAll,
  flipKind,
  groupByDate,
  isLowConfidence,
  looksLikeCardExport,
  lowConfidenceReason,
  merchantName,
  setAllSelected,
  setCategory,
  setDate,
  setSelected,
  similarIndexes,
  summarise,
  toTransactions,
  type ReviewRow,
} from './review';
import { resetSession, useSession, type ImportSession } from './session';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function RowView({
  row,
  currency,
  categories,
  similarCount,
  expanded,
  dateOpen,
  onToggle,
  onExpand,
  onCategory,
  onFlip,
  onDate,
  onSimilar,
}: {
  row: ReviewRow;
  currency: string;
  categories: Category[];
  similarCount: number;
  expanded: boolean;
  dateOpen: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onCategory: () => void;
  onFlip: () => void;
  onDate: (open: boolean, date?: string) => void;
  onSimilar: () => void;
}) {
  const c = useTheme();
  const i = row.index;
  const low = isLowConfidence(row);
  const category = categories.find((x) => x.id === row.categoryId);
  const money = `${row.kind === 'income' ? '+' : '-'}${formatMoney(row.amount, currency)}`;
  const moneyWords = `${row.kind === 'income' ? 'Income' : 'Spending'} ${formatMoney(row.amount, currency)}`;
  return (
    <View testID={`review-row-${i}`} style={[styles.row, { borderBottomColor: c.border, backgroundColor: c.glass }, !row.selected && { opacity: 0.6 }]}>
      <View style={styles.rowTop}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: row.selected }}
          accessibilityLabel={`Import ${row.description}`}
          testID={`review-toggle-${i}`}
          style={styles.hit}>
          <View style={[styles.box, { borderColor: row.selected ? c.accent : c.textSecondary, backgroundColor: row.selected ? c.accent : 'transparent' }]}>
            <T variant="label" style={{ color: row.selected ? c.onAccent : 'transparent' }} accessibilityLabel="">
              ✓
            </T>
          </View>
        </Pressable>
        <Pressable
          onPress={onExpand}
          accessibilityRole="button"
          accessibilityLabel={`${row.description}, ${moneyWords}, ${formatDate(row.date)}${row.duplicateOf ? ', looks like a duplicate' : ''}${low ? ', please check' : ''}`}
          accessibilityHint="Shows ways to fix this row"
          testID={`review-open-${i}`}
          style={styles.main}>
          <T variant="label" numberOfLines={2}>
            {row.description}
          </T>
          <View style={styles.pills}>
            {row.duplicateOf ? <Pill label="Duplicate?" tone="warning" /> : null}
            {low ? <Pill label="Check this" tone="warning" /> : null}
          </View>
        </Pressable>
        <T variant="label" tone={row.kind === 'income' ? 'positive' : 'negative'} accessibilityLabel={moneyWords} testID={`review-amount-${i}`}>
          {money}
        </T>
      </View>
      <Pressable
        onPress={onCategory}
        accessibilityRole="button"
        accessibilityLabel={`Category: ${category?.name ?? 'none'}. Change`}
        testID={`review-category-${i}`}
        style={[styles.category, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
        <T variant="caption" tone={category ? 'default' : 'secondary'}>
          {category ? category.name : 'Choose a category'} ▾
        </T>
      </Pressable>
      {row.duplicateOf ? (
        <T variant="caption" tone="secondary">
          A matching item is already saved, so this row is unticked.
        </T>
      ) : null}
      {low ? (
        <T variant="caption" tone="warning" testID={`review-reason-${i}`}>
          {lowConfidenceReason(row)}
        </T>
      ) : null}
      {expanded || low ? (
        <View style={styles.fixes}>
          <Button
            label={row.kind === 'income' ? 'Mark as spending' : 'Mark as income'}
            variant="secondary"
            onPress={onFlip}
            testID={`review-flip-${i}`}
            accessibilityHint="Switches this row between money in and money out"
          />
          <Button label={dateOpen ? 'Close date' : `Date: ${formatDate(row.date)}`} variant="secondary" onPress={() => onDate(!dateOpen)} testID={`review-date-${i}`} />
          {dateOpen ? <DateField label="Date" value={row.date} onChange={(d) => onDate(true, d)} testID={`review-date-field-${i}`} /> : null}
          {similarCount > 0 && row.categoryId ? (
            <Button
              label={`Apply to all similar rows (${similarCount})`}
              variant="secondary"
              onPress={onSimilar}
              testID={`review-similar-${i}`}
              accessibilityHint={`Gives ${plural(similarCount, 'other row', 'other rows')} of ${merchantName(row.description)} this category`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ReviewBody({ session, data }: { session: ImportSession; data: ReviewData }) {
  const c = useTheme();
  const { categories, settings } = data;
  const currency = settings.currency;
  const saveRule = useRepoMutation((r, rule: Parameters<typeof r.upsertCategoryRule>[0]) => r.upsertCategoryRule(rule));
  const saveImport = useRepoMutation(
    async (r, txns: Transaction[], record: ImportRecord, template: ImportTemplate | null) => {
      await r.upsertTransactions(txns);
      await r.addImport(record);
      if (template) await r.saveImportTemplate(template);
    },
  );

  const [rules, setRules] = useState<CategoryRule[]>(() => data.rules.map((r) => ({ pattern: r.pattern, categoryId: r.categoryId })));
  const [rows, setRows] = useState<ReviewRow[]>(() => buildReviewRows(session.result?.rows ?? [], data.transactions, rules, categories));
  const [open, setOpen] = useState<number[]>([]);
  const [dateOpen, setDateOpen] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ index: number; chosen: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number; spending: number; income: number; from: string; to: string } | null>(null);

  const summary = summarise(rows);
  const duplicates = rows.filter((r) => r.duplicateOf).length;
  const checks = rows.filter(isLowConfidence).length;
  const allOn = rows.length > 0 && rows.every((r) => r.selected);
  const tabular = session.table !== null && (session.fileKind === 'csv' || session.fileKind === 'xlsx');
  const catOf = (id: string | null) => categories.find((x) => x.id === id);

  const chooseCategory = (index: number, categoryId: string | null) => {
    setRows((rs) => setCategory(rs, index, categoryId));
    if (categoryId) setPicker({ index, chosen: categoryId });
    else setPicker(null);
  };

  const answerRule = async (yes: boolean) => {
    const p = picker;
    setPicker(null);
    if (!p?.chosen || !yes) return;
    const row = rows.find((r) => r.index === p.index);
    if (!row) return;
    const rule = learnRule(row.description, p.chosen);
    setRules((rs) => [...rs.filter((r) => r.pattern.toLowerCase() !== rule.pattern.toLowerCase()), rule]);
    setRows((rs) => applyCategoryToSimilar(rs, p.index, p.chosen));
    try {
      await saveRule({ id: newId(), pattern: rule.pattern, categoryId: rule.categoryId, createdAt: new Date().toISOString() });
    } catch {
      setError("The rule couldn't be saved, but this review keeps the category.");
    }
  };

  const doImport = async () => {
    if (saving || summary.count === 0) return;
    setSaving(true);
    setError(null);
    try {
      const importId = newId();
      const txns = toTransactions(rows, importId, newId);
      const now = new Date().toISOString();
      const mapping = session.mapping;
      const template: ImportTemplate | null = mapping ? { sourceName: session.sourceName, mapping: { ...mapping }, lastUsed: now } : null;
      await saveImport(txns, { id: importId, sourceName: session.sourceName, fileKind: session.fileKind, importedAt: now, rowCount: txns.length }, template);
      const dates = txns.map((t) => t.date).sort();
      setDone({ count: txns.length, spending: summary.spending, income: summary.income, from: dates[0], to: dates[dates.length - 1] });
    } catch {
      setError("Nothing was saved, because something went wrong. Your phone's storage may be full. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Screen testID="import-done">
        <ScreenHeader title="Imported" />
        <Card>
          <T variant="heading" accessibilityRole="header" testID="import-done-text">
            {plural(done.count, 'item', 'items')} added
          </T>
          <T tone="secondary">
            {formatMoneyTrim(done.spending, currency)} spending and {formatMoneyTrim(done.income, currency)} income, dated {formatDate(done.from)}
            {done.to !== done.from ? ` to ${formatDate(done.to)}` : ''}.
          </T>
          <T variant="caption" tone="secondary">
            Next time a file from {session.sourceName || 'this source'} imports with the same choices, and the rules you set are used again.
          </T>
        </Card>
        <Button
          label="Go to Month"
          testID="review-done"
          onPress={() => {
            resetSession();
            router.navigate('/month');
          }}
        />
      </Screen>
    );
  }

  const pickerRow = picker ? rows.find((r) => r.index === picker.index) : null;
  const pickerOptions = pickerRow ? categories.filter((x) => !x.archived && x.kind === pickerRow.kind) : [];
  const similarOfPicker = pickerRow ? similarIndexes(rows, pickerRow.index).length : 0;
  const groups = groupByDate(rows);

  return (
    <View style={{ flex: 1 }}>
      <Screen testID="review-screen">
        <ScreenHeader title="Review" subtitle={session.sourceName} />
        <Card>
          <T variant="label">
            {plural(rows.length, 'item', 'items')} found
          </T>
          {duplicates > 0 ? (
            <T variant="caption" tone="warning">
              {plural(duplicates, 'row looks', 'rows look')} like {duplicates === 1 ? 'an item' : 'items'} you already saved and {duplicates === 1 ? 'is' : 'are'} unticked.
            </T>
          ) : null}
          {checks > 0 ? (
            <T variant="caption" tone="warning">
              {plural(checks, 'row needs', 'rows need')} a look. Fix the date or direction with one tap.
            </T>
          ) : null}
          {(session.result?.problems ?? []).slice(0, 3).map((p) => (
            <T key={p} variant="caption" tone="secondary">
              {p}
            </T>
          ))}
          <View style={styles.actions}>
            <Button label={allOn ? 'Untick all' : 'Select all'} variant="secondary" onPress={() => setRows((rs) => setAllSelected(rs, !allOn))} testID="review-select-all" />
            {tabular ? <Button label="Fix columns" variant="plain" onPress={() => router.push('/import/columns')} testID="review-fix-columns" accessibilityHint="Choose which column holds the date, description and amount" /> : null}
          </View>
        </Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing to review" message="No rows were found. Go back and try another file." action={<Button label="Back" onPress={() => router.back()} testID="review-back" />} />
        ) : (
          groups.map((g) => (
            <View key={g.date} style={{ gap: Spacing.one }}>
              <T variant="caption" tone="secondary" accessibilityRole="header" style={{ fontWeight: '700' }}>
                {formatDate(g.date)}
              </T>
              <Card>
                {g.rows.map((r) => (
                  <RowView
                    key={r.index}
                    row={r}
                    currency={currency}
                    categories={categories}
                    similarCount={similarIndexes(rows, r.index).length}
                    expanded={open.includes(r.index)}
                    dateOpen={dateOpen === r.index}
                    onToggle={() => setRows((rs) => setSelected(rs, r.index, !r.selected))}
                    onExpand={() => setOpen((o) => (o.includes(r.index) ? o.filter((x) => x !== r.index) : [...o, r.index]))}
                    onCategory={() => setPicker({ index: r.index, chosen: null })}
                    onFlip={() => setRows((rs) => flipKind(rs, r.index, rules, categories))}
                    onDate={(isOpen, d) => {
                      setDateOpen(isOpen ? r.index : null);
                      if (d) setRows((rs) => setDate(rs, r.index, d));
                    }}
                    onSimilar={() => setRows((rs) => applyCategoryToSimilar(rs, r.index, r.categoryId))}
                  />
                ))}
              </Card>
            </View>
          ))
        )}
        <View style={{ height: 150 }} />
      </Screen>

      <View style={[styles.bar, { backgroundColor: c.backgroundElement, borderTopColor: c.border }]}>
        {error ? (
          <T variant="caption" tone="negative" accessibilityRole="alert" testID="review-error">
            {error}
          </T>
        ) : null}
        <T variant="label" testID="review-summary" accessibilityLabel={`Import ${plural(summary.count, 'item', 'items')}, ${formatMoneyTrim(summary.spending, currency)} spending, ${formatMoneyTrim(summary.income, currency)} income`}>
          {`Import ${plural(summary.count, 'item', 'items')} · ${formatMoneyTrim(summary.spending, currency)} spending · ${formatMoneyTrim(summary.income, currency)} income`}
        </T>
        <Button label={saving ? 'Saving…' : 'Import selected'} onPress={doImport} disabled={saving || summary.count === 0} testID="review-import" />
      </View>

      <Sheet visible={!!picker && !!pickerRow} onClose={() => setPicker(null)} title={picker?.chosen ? 'Make this a rule?' : 'Choose a category'} testID="review-category-sheet">
        {pickerRow && picker?.chosen ? (
          <View style={{ gap: Spacing.three, paddingBottom: Spacing.two }}>
            <T accessibilityRole="header" testID="rule-confirm-text">
              {`Always put ${merchantName(pickerRow.description)} in ${catOf(picker.chosen)?.name ?? 'this category'}?`}
            </T>
            <T variant="caption" tone="secondary">
              {similarOfPicker > 0
                ? `Yes also changes ${plural(similarOfPicker, 'similar row', 'similar rows')} here, and is used for every later import. You can change it again any time.`
                : 'Yes is used for every later import. You can change it again any time.'}
            </T>
            <Button label="Yes, always" onPress={() => answerRule(true)} testID="rule-confirm-yes" />
            <Button label="Just this row" variant="secondary" onPress={() => answerRule(false)} testID="rule-confirm-no" />
          </View>
        ) : pickerRow ? (
          <View style={{ gap: Spacing.one, paddingBottom: Spacing.two }}>
            {pickerOptions.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => chooseCategory(pickerRow.index, cat.id)}
                accessibilityRole="button"
                accessibilityLabel={cat.name}
                accessibilityState={{ selected: cat.id === pickerRow.categoryId }}
                testID={`review-category-option-${cat.id}`}
                style={[styles.option, cat.id === pickerRow.categoryId && { backgroundColor: c.backgroundSelected }]}>
                <T>{cat.name}</T>
                {cat.id === pickerRow.categoryId ? (
                  <T tone="accent" accessibilityLabel="Selected">
                    ✓
                  </T>
                ) : null}
              </Pressable>
            ))}
            <Pressable
              onPress={() => chooseCategory(pickerRow.index, null)}
              accessibilityRole="button"
              accessibilityLabel="No category"
              testID="review-category-option-none"
              style={styles.option}>
              <T tone="secondary">No category</T>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

export interface ReviewData {
  transactions: Transaction[];
  categories: Category[];
  rules: { pattern: string; categoryId: string }[];
  settings: { currency: string };
}

export default function ReviewScreen() {
  const { isPro } = usePro();
  const session = useSession();
  const { data, error, reload } = useRepoQuery(async (r) => ({
    transactions: await r.listTransactions(),
    categories: await r.listCategories(),
    rules: await r.listCategoryRules(),
    settings: await r.getSettings(),
  }));

  if (!isPro) return <ImportProLocked />;
  if (!session.result) {
    return (
      <Screen testID="review-screen">
        <EmptyState
          title="Nothing to review"
          message="Choose a file, a photo or a bank SMS first."
          action={<Button label="Start an import" onPress={() => router.replace('/import')} testID="review-start" />}
        />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen testID="review-screen">
        {error ? (
          <EmptyState title="Couldn't load your data" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="review-retry" />} />
        ) : (
          <T tone="secondary">Loading…</T>
        )}
      </Screen>
    );
  }
  return <ReviewBody key={session.token} session={session} data={data} />;
}

const styles = StyleSheet.create({
  row: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, gap: Spacing.one, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minHeight: 44, justifyContent: 'center', gap: 2 },
  pills: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  category: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three, borderWidth: 1, borderRadius: Radius.pill, marginLeft: 52 },
  fixes: { gap: Spacing.two, marginLeft: 52, marginTop: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.three, gap: Spacing.two, borderTopWidth: 1 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, borderRadius: Radius.sm },
});
