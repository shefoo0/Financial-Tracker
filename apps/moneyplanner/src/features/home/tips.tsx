// One-time tips: small bubbles that point at a control the first time and never come back once dismissed.
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useSettingSetter } from '@/data/useSettingSetter';
import { useTheme } from '@/hooks/use-theme';
import type { Settings } from '@/types';

export const TIP_EDIT_BALANCE = 'edit-balance';
export const TIP_EDIT_HOME = 'edit-home';
/** The "Edit Home" tip waits until Home has been opened this many times. */
export const EDIT_HOME_TIP_VISITS = 3;

/** Which tips to show now, given what is saved: the balance pencil tip first, the Edit Home tip later. */
export function tipsToShow(settings: Pick<Settings, 'tipsSeen' | 'homeVisits'>): { balance: boolean; editHome: boolean } {
  const seen = settings.tipsSeen ?? [];
  const balance = !seen.includes(TIP_EDIT_BALANCE);
  const editHome = !balance && !seen.includes(TIP_EDIT_HOME) && (settings.homeVisits ?? 0) >= EDIT_HOME_TIP_VISITS;
  return { balance, editHome };
}

/** Counts this opening of Home (once per mount) and saves tips as dismissed. */
export function useHomeTips(settings: Settings, active: boolean) {
  const { set } = useSettingSetter();
  const counted = useRef(false);
  const visits = settings.homeVisits ?? 0;
  useEffect(() => {
    if (!active || counted.current) return;
    counted.current = true;
    void set({ homeVisits: visits + 1 });
  }, [active, visits, set]);
  const dismiss = (id: string) => {
    const seen = settings.tipsSeen ?? [];
    if (!seen.includes(id)) void set({ tipsSeen: [...seen, id] });
  };
  return { ...tipsToShow(settings), dismiss };
}

/** The bubble: dark on light, light on dark; the whole bubble is the "got it" button. */
export function TipBubble({ text, onDismiss, testID, arrow = 'top' }: { text: string; onDismiss: () => void; testID?: string; arrow?: 'top' | 'bottom' }) {
  const c = useTheme();
  const tip = (
    <View style={{ alignSelf: 'flex-end', marginRight: 22, width: 12, height: 12, backgroundColor: c.text, transform: [{ rotate: '45deg' }], [arrow === 'top' ? 'marginBottom' : 'marginTop']: -6 }} />
  );
  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel={`Tip: ${text}. Double tap to dismiss`}
      testID={testID}
      style={{ alignSelf: 'flex-end', maxWidth: 240 }}>
      {arrow === 'top' ? tip : null}
      <View style={{ backgroundColor: c.text, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 44, justifyContent: 'center' }}>
        <T variant="label" style={{ color: c.background }} maxFontSizeMultiplier={1.3}>
          {text}
        </T>
        <T variant="caption" style={{ color: c.background, opacity: 0.8 }} maxFontSizeMultiplier={1.3}>
          Tap to dismiss
        </T>
      </View>
      {arrow === 'bottom' ? tip : null}
    </Pressable>
  );
}
