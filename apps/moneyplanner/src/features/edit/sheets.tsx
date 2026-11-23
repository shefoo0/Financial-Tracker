// The edit-in-place sheets. Each is `({ visible, onClose })`, saves instantly (no Save button) and is built from the
// one-editor-per-setting components in ./editors.
import { View } from 'react-native';

import { HeroCard, Sheet, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { AlertsSettings, BillRemindersEditor } from '@/features/alerts/AlertsSettings';
import { AppearanceSetting } from '@/features/profiles/AppearanceSetting';
import { useCardTone } from '@/hooks/use-card-tone';
import { formatMoney } from '@/lib/money';
import type { Settings } from '@/types';
import { BalanceEditor, BufferEditor, CardStyleEditor, ChartRangeEditor, CurrencyEditor, PaydayEditor, SpendingPeriodEditor } from './editors';
import { SheetBody } from './SheetBody';

export interface EditSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function BalanceSheet({ visible, onClose }: EditSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Balance card" testID="balance-sheet">
      <SheetBody>
        {(s) => (
          <>
            <BalanceEditor settings={s} />
            <BufferEditor settings={s} />
            <ChartRangeEditor settings={s} />
            <CardStyleEditor settings={s} />
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}

export function PaydaySheet({ visible, onClose }: EditSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Payday" testID="payday-sheet">
      <SheetBody>{(s) => <PaydayEditor settings={s} />}</SheetBody>
    </Sheet>
  );
}

export function RemindersSheet({ visible, onClose }: EditSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Bill reminders" testID="reminders-sheet">
      <SheetBody>{(s) => <BillRemindersEditor settings={s} />}</SheetBody>
    </Sheet>
  );
}

/** Phone notifications and alert levels; `withReminders` adds the bill reminders (used by Settings -> Notifications). */
export function AlertsSheet({ visible, onClose, withReminders = false }: EditSheetProps & { withReminders?: boolean }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={withReminders ? 'Notifications' : 'Alerts'} testID="alerts-sheet">
      <SheetBody>{(s) => <AlertsSettings settings={s} withReminders={withReminders} />}</SheetBody>
    </Sheet>
  );
}

export function SpendingSheet({ visible, onClose }: EditSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Spending by category" testID="spending-sheet">
      <SheetBody>{(s) => <SpendingPeriodEditor settings={s} />}</SheetBody>
    </Sheet>
  );
}

/** A small stand-in for the Home balance card, in the chosen card style. */
function BalancePreview({ settings }: { settings: Settings }) {
  const tone = useCardTone(settings.chartStyle);
  const text = { color: tone.ink };
  return (
    <HeroCard chartStyle={settings.chartStyle} testID="appearance-preview" accessibilityLabel={`Preview of the balance card: ${formatMoney(settings.startingBalance, settings.currency)}`}>
      <T variant="label" style={{ color: tone.sub }}>
        Balance today
      </T>
      <T variant="title" style={text} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {formatMoney(settings.startingBalance, settings.currency)}
      </T>
    </HeroCard>
  );
}

export function AppearanceSheet({ visible, onClose }: EditSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Appearance" testID="appearance-sheet">
      <SheetBody>
        {(s) => (
          <>
            <BalancePreview settings={s} />
            <View style={{ gap: Spacing.one }}>
              <T variant="label">Mode</T>
              <AppearanceSetting testID="settings-appearance" />
            </View>
            <CardStyleEditor settings={s} />
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}

export function MoneySheet({ visible, onClose }: EditSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Money" testID="money-sheet">
      <SheetBody>
        {(s) => (
          <>
            <CurrencyEditor settings={s} />
            <PaydayEditor settings={s} />
            <BalanceEditor settings={s} />
            <BufferEditor settings={s} />
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}
