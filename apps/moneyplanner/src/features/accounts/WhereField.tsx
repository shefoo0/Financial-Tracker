// The "Paid from / Received into" picker of item forms (milestone 3b). Cards are free; other accounts are Pro.
import { View } from 'react-native';

import { SelectField, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePro } from '@/lib/pro';
import type { Kind, PlanInput } from '@/types';

import { whereLabel, whereOptions, type Where } from './where';

export function WhereField({ input, kind, value, onChange, testID }: { input: PlanInput; kind: Kind; value: Where; onChange: (w: Where) => void; testID?: string }) {
  const { isPro } = usePro();
  const options = whereOptions({ mainName: input.settings.mainAccountName ?? 'Main account', accounts: input.accounts ?? [], debts: input.debts, isPro, current: value });
  // Only the main account to choose from: nothing to show.
  if (options.length < 2) return null;
  const hint = value.startsWith('card:') ? (kind === 'income' ? 'A refund to the card: it lowers what you owe.' : 'Charged to the card: the bank pays it on the card’s due date.') : null;
  return (
    <View style={{ gap: Spacing.one }}>
      <SelectField label={whereLabel(kind)} value={value} options={options} onChange={onChange} testID={testID} />
      {hint ? (
        <T variant="caption" tone="secondary">
          {hint}
        </T>
      ) : null}
    </View>
  );
}
