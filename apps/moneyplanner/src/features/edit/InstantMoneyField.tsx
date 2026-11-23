// A money field that saves itself: when it loses focus (or Done / Return is pressed) the amount is checked and
// written with `onCommit`, then a brief "Saved" tick shows. Leaving the sheet with a typed amount saves it too.
import { useEffect, useRef, useState } from 'react';

import { TextField } from '@/components/ui';
import { formatAmount, parseAmount } from '@/lib/money';
import type { Fils } from '@/types';
import { SAVED_TEXT, useSavedTick } from './useSavedTick';

const plain = (fils: Fils) => formatAmount(fils).replace(/,/g, '');

export function InstantMoneyField({
  label,
  saved,
  currency,
  onCommit,
  hint,
  testID,
}: {
  label: string;
  /** The amount now stored (shown until the user types). */
  saved: Fils;
  currency: string;
  /** Writes the amount (positive fils); resolves to true when it was saved. */
  onCommit: (fils: Fils) => Promise<boolean>;
  hint?: string;
  testID?: string;
}) {
  const [text, setText] = useState(plain(saved));
  const [error, setError] = useState<string | null>(null);
  const tick = useSavedTick();
  const dirty = useRef(false);
  const current = useRef({ text, saved, onCommit });
  useEffect(() => {
    current.current = { text, saved, onCommit };
  });
  useEffect(
    () => () => {
      // The sheet closed with an unsaved, valid amount: save it.
      const { text: t, saved: s, onCommit: commit } = current.current;
      const parsed = parseAmount(t);
      if (dirty.current && parsed != null && Math.abs(parsed) !== s) commit(Math.abs(parsed)).catch(() => undefined);
    },
    [],
  );

  const commit = async () => {
    if (!dirty.current) return;
    const parsed = parseAmount(text);
    if (parsed == null) {
      setError(text.trim() ? 'Enter an amount like 1,500.00.' : 'Enter an amount (0 for none).');
      return;
    }
    setError(null);
    dirty.current = false;
    const fils = Math.abs(parsed);
    setText(plain(fils));
    if (fils === saved) return;
    if (await onCommit(fils)) tick.flash();
  };

  return (
    <TextField
      label={`${label} (${currency})`}
      value={text}
      onChangeText={(t) => {
        dirty.current = true;
        setText(t);
        setError(null);
      }}
      onBlur={commit}
      keyboardType="decimal-pad"
      placeholder="0.00"
      error={error}
      hint={tick.saved ? SAVED_TEXT : hint}
      testID={testID}
    />
  );
}
