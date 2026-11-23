import { useState } from 'react';

import { formatAmount, parseAmount } from '@/lib/money';
import type { Fils } from '@/types';
import { TextField } from './TextField';

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
