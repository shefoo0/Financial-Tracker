// Shared UI kit ("Bold cards + Glass fintech", 2026 redesign). Split into
// text.tsx (T), internal.tsx (gradient and glass helpers) and surfaces.tsx
// (AuroraBackground, Card, HeroCard, IconBadge, Avatar, StatTile, Pill);
// everything is re-exported from here.
// Every interactive element takes a `testID` (for Maestro) and has an
// accessibility label. Tap targets are at least 44pt tall. Text scales with the
// system font size.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, isValidISODate, today } from '@/lib/dates';
import { formatAmount, parseAmount } from '@/lib/money';
import type { Fils, ISODate } from '@/types';
import { Glass, GradientFill } from './internal';
import { AuroraBackground } from './surfaces';
import { T, textStyles, type Tone } from './text';

export { T, type Tone } from './text';
export { AuroraBackground, Avatar, Card, HeroCard, IconBadge, Pill, StatTile } from './surfaces';

/** A full screen with the aurora behind it, safe-area padding, optional scrolling and a centred max width. */
export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const inner = <View style={styles.screenInner}>{children}</View>;
  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID={testID}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </SafeAreaView>
    </View>
  );
}

/** Big title row: small subtitle above the title (e.g. "Good morning" / "Sam") and an optional right element. */
export function ScreenHeader({ title, subtitle, right, testID }: { title: string; subtitle?: string; right?: ReactNode; testID?: string }) {
  return (
    <View style={styles.screenHeader} testID={testID}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <T variant="label" tone="secondary" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
        <T variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </T>
      </View>
      {right}
    </View>
  );
}

/** Bottom sheet: dimmed backdrop (tap to close), grab handle, scrollable content. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          testID={testID}
          style={[styles.sheet, { backgroundColor: c.backgroundElement, borderColor: c.glassBorder, paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
          <View style={[styles.handle, { backgroundColor: c.textSecondary }]} />
          {title ? (
            <T variant="heading" accessibilityRole="header" style={{ marginBottom: Spacing.two }}>
              {title}
            </T>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader} accessibilityRole="header">
      <T variant="heading">{title}</T>
      {action}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  testID,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'plain';
  disabled?: boolean;
  testID?: string;
  accessibilityHint?: string;
}) {
  const c = useTheme();
  const bg = { primary: 'transparent', secondary: c.glass, destructive: c.negative, plain: 'transparent' }[variant];
  const fg = { primary: '#FFFFFF', secondary: c.text, destructive: c.onNegative, plain: c.accent }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: c.border },
      ]}>
      {variant === 'primary' && <GradientFill colors={c.hero} />}
      <Text style={[textStyles.label, variant === 'primary' && { fontWeight: '800' }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function FieldShell({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <T variant="label">{label}</T>
      {children}
      {error ? (
        <T variant="caption" tone="negative" accessibilityLabel={`Error: ${error}`}>
          {error}
        </T>
      ) : hint ? (
        <T variant="caption" tone="secondary">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  multiline,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address';
  testID?: string;
}) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  // iPhone number pads have no Return key, so numeric fields get a "Done" bar.
  const numericOnIOS = Platform.OS === 'ios' && (keyboardType === 'decimal-pad' || keyboardType === 'number-pad');
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        returnKeyType={multiline ? 'default' : 'done'}
        inputAccessoryViewID={numericOnIOS ? KEYBOARD_DONE_ID : undefined}
        accessibilityLabel={label}
        testID={testID}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { color: c.text, borderColor: error ? c.negative : focused ? c.accent : c.border, backgroundColor: c.backgroundElement }, multiline && { minHeight: 88, textAlignVertical: 'top' }]}
      />
    </FieldShell>
  );
}

const KEYBOARD_DONE_ID = 'keyboard-done-bar';

/**
 * The "Done" bar shown above iPhone number pads (see TextField). Render it once
 * near the root of the app; it does nothing on Android and the web.
 */
export function KeyboardDoneBar() {
  const c = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={[styles.doneBar, { backgroundColor: c.backgroundElement, borderTopColor: c.border }]}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Done"
          testID="keyboard-done"
          style={styles.doneButton}>
          <T variant="label" tone="accent">
            Done
          </T>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/**
 * Money input. Shows/edits "1,234.50" and reports fils (or null when empty or invalid).
 * Amounts are always entered as positive numbers; the item's kind says income or cost.
 */
export function MoneyField({
  label,
  value,
  onChange,
  currency,
  error,
  hint,
  testID,
}: {
  label: string;
  value: Fils | null;
  onChange: (fils: Fils | null) => void;
  currency: string;
  error?: string | null;
  hint?: string;
  testID?: string;
}) {
  const [text, setText] = useState(value == null ? '' : formatAmount(value).replace(/,/g, ''));
  return (
    <TextField
      label={`${label} (${currency})`}
      value={text}
      keyboardType="decimal-pad"
      placeholder="0.00"
      error={error}
      hint={hint}
      testID={testID}
      onChangeText={(t) => {
        setText(t);
        const parsed = parseAmount(t);
        onChange(parsed == null ? null : Math.abs(parsed));
      }}
    />
  );
}

/** Date input: a native picker on the phone, a 'YYYY-MM-DD' text box on the web. */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  testID,
}: {
  label: string;
  value: ISODate | null;
  onChange: (d: ISODate) => void;
  error?: string | null;
  hint?: string;
  testID?: string;
}) {
  const c = useTheme();
  const scheme = useColorScheme();
  const [open, setOpen] = useState(false);
  // Web: free typing; the value updates once the text is a valid date.
  const [webText, setWebText] = useState<string | null>(null);
  if (Platform.OS === 'web') {
    const text = webText ?? value ?? '';
    return (
      <TextField
        label={label}
        value={text}
        placeholder="YYYY-MM-DD"
        error={error ?? (text && !isValidISODate(text) ? 'Use the format YYYY-MM-DD' : null)}
        hint={hint}
        testID={testID}
        onChangeText={(t) => {
          setWebText(t);
          if (isValidISODate(t)) onChange(t);
        }}
      />
    );
  }
  const current = value && isValidISODate(value) ? value : today();
  const [y, m, d] = current.split('-').map(Number);
  const pickerValue = new Date(y, m - 1, d);
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : 'not set'}`}
        accessibilityHint="Opens a date picker"
        testID={testID}
        style={[styles.input, styles.pressableInput, { borderColor: error ? c.negative : c.border, backgroundColor: c.backgroundElement }]}>
        <T>{value ? formatDate(value) : 'Choose a date'}</T>
      </Pressable>
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === 'set' && date) onChange(today(date));
          }}
        />
      )}
      {Platform.OS === 'ios' && (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label} testID={testID ? `${testID}-sheet` : undefined}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="inline"
            themeVariant={scheme}
            onChange={(_event, date) => {
              if (date) onChange(today(date));
            }}
          />
          <Button label="Done" onPress={() => setOpen(false)} testID={testID ? `${testID}-done` : undefined} />
        </Sheet>
      )}
    </FieldShell>
  );
}

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

/** A field that opens a list to pick one option. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  error,
  testID,
}: {
  label: string;
  value: V | null;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <FieldShell label={label} error={error}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'not chosen'}`}
        testID={testID}
        style={[styles.input, styles.pressableInput, { borderColor: error ? c.negative : c.border, backgroundColor: c.backgroundElement }]}>
        <T tone={selected ? 'default' : 'secondary'}>{selected?.label ?? placeholder}</T>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: o.value === value }}
            testID={testID ? `${testID}-option-${o.value}` : undefined}
            style={[styles.option, o.value === value && { backgroundColor: c.backgroundSelected }]}>
            <T style={o.value === value ? { fontWeight: '700' } : undefined}>{o.label}</T>
            {o.value === value ? <T tone="accent" accessibilityLabel="Selected">✓</T> : null}
          </Pressable>
        ))}
      </Sheet>
    </FieldShell>
  );
}

/** Two to four options side by side, e.g. Income / Cost. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: SelectOption<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <Glass radius={Radius.md} style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={o.label}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={styles.segment}>
            {active && <GradientFill colors={c.hero} />}
            <T variant="label" tone={active ? 'onHero' : 'default'} style={active ? { fontWeight: '800' } : undefined}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </Glass>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {description ? (
          <T variant="caption" tone="secondary">
            {description}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        testID={testID}
        trackColor={{ true: c.accent, false: c.border }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

/** A tappable (or static) list row: title, optional subtitle, optional right-hand value. */
export function ListRow({
  title,
  subtitle,
  value,
  valueTone,
  onPress,
  testID,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: Tone;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const content = (
    <>
      <View style={{ flex: 1 }}>
        <T numberOfLines={2}>{title}</T>
        {subtitle ? (
          <T variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="number" tone={valueTone}>
          {value}
        </T>
      ) : null}
    </>
  );
  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.border }, styles.rowDivider, pressed && { backgroundColor: c.backgroundSelected }]}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, styles.rowDivider, { borderBottomColor: c.border }]} accessible accessibilityLabel={label} testID={testID}>
      {content}
    </View>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <Glass style={styles.empty}>
      <T variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </T>
      <T tone="secondary" style={{ textAlign: 'center' }}>
        {message}
      </T>
      {action}
    </Glass>
  );
}

/** A label/value pair for summaries, e.g. "Free money" / "AED 2,300.00". */
export function Stat({ label, value, tone, testID }: { label: string; value: string; tone?: Tone; testID?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <T variant="caption" tone="secondary">
        {label}
      </T>
      <T variant="number" tone={tone}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: Spacing.six },
  screenInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  button: { minHeight: 50, borderRadius: 16, overflow: 'hidden', paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  field: { gap: Spacing.one },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  pressableInput: { justifyContent: 'center' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(3,4,12,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, opacity: 0.5, marginBottom: Spacing.three },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, borderRadius: 14 },
  segmented: { flexDirection: 'row', padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.two },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.three },
  stat: { flex: 1, minWidth: 120, gap: 2 },
  doneBar: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two },
  doneButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
});
