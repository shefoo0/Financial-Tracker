// Renders the visible Home cards from the saved layout, each in its frame (the pencil at the top right opens the
// card's edit sheet), then the "Edit Home" link.
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { EditButton } from '@/features/edit';
import { cardFor, type HomeCardDef } from './cards';
import type { HomeCtx, SheetKey } from './ctx';
import { homeLayoutOf } from './layout';
import { TIP_EDIT_HOME, TipBubble } from './tips';

/** What a screen reader hears after "Edit": the thing the sheet changes. */
const EDIT_LABEL: Record<SheetKey, string> = {
  balance: 'balance card',
  payday: 'safe to spend',
  reminders: 'bill reminders',
  alerts: 'alerts',
  spending: 'spending period',
};

function CardFrame({ def, ctx }: { def: HomeCardDef; ctx: HomeCtx }) {
  const Body = def.component;
  if (def.hasContent && !def.hasContent(ctx)) return null;
  const sheet = def.sheet;
  if (!sheet) return <Body ctx={ctx} />;
  return (
    <View testID={`home-card-${def.id}`}>
      <Body ctx={ctx} />
      <View style={{ position: 'absolute', top: Spacing.one, right: Spacing.one }}>
        <EditButton onPress={() => ctx.openSheet(sheet)} label={EDIT_LABEL[sheet]} testID={`edit-${sheet}`} />
      </View>
      {sheet === 'balance' && ctx.balanceTip ? (
        <View style={{ position: 'absolute', top: Spacing.one + 46, right: Spacing.two, zIndex: 2 }}>
          <TipBubble text="Tap ✎ to edit" onDismiss={() => ctx.dismissTip('edit-balance')} testID="tip-edit-balance" />
        </View>
      ) : null}
    </View>
  );
}

export function HomeCards({ ctx, editHomeTip }: { ctx: HomeCtx; editHomeTip: boolean }) {
  const router = useRouter();
  const defs = homeLayoutOf(ctx.input.settings)
    .filter((e) => e.visible)
    .flatMap((e) => cardFor(e.id) ?? []);
  return (
    <>
      {defs.map((def) => (
        <CardFrame key={def.id} def={def} ctx={ctx} />
      ))}
      {defs.length === 0 ? (
        <T tone="secondary" testID="home-no-cards">
          All your cards are hidden. Use Edit Home to show them again.
        </T>
      ) : null}
      {editHomeTip ? <TipBubble text="Show, hide or reorder cards in Edit Home" arrow="bottom" onDismiss={() => ctx.dismissTip(TIP_EDIT_HOME)} testID="tip-edit-home" /> : null}
      <Pressable
        onPress={() => {
          if (editHomeTip) ctx.dismissTip(TIP_EDIT_HOME);
          router.push('/home-edit' as never);
        }}
        accessibilityRole="link"
        accessibilityLabel="Edit Home"
        accessibilityHint="Choose which cards show on Home and in what order"
        testID="home-edit-link"
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="label" tone="accent">
          Edit Home
        </T>
      </Pressable>
    </>
  );
}
