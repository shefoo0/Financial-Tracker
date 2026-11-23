// Home card "Coming up": the next payments and income, each with a reminder bell and a Paid button.
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card, IconBadge, SectionHeader, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { categoryColor, categoryEmoji } from '@/features/dashboard/upcoming';
import { useTheme } from '@/hooks/use-theme';
import type { HomeCtx } from './ctx';

export function UpcomingCard({ ctx }: { ctx: HomeCtx }) {
  const router = useRouter();
  const c = useTheme();
  const { upcoming } = ctx.model;
  const { input, money } = ctx;
  const reminders = input.settings.billReminders;
  return (
    <Card testID="dashboard-upcoming">
      {/* The pencil sits at the card's top right, so "See all" keeps clear of it. */}
      <View style={{ paddingRight: 52 }}>
        <SectionHeader
          title="Coming up"
          action={
            <Pressable
              onPress={() => router.push('/month')}
              accessibilityRole="link"
              accessibilityLabel="See all items this month"
              testID="dashboard-see-all"
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <T variant="label" tone="accent">
                See all
              </T>
            </Pressable>
          }
        />
      </View>
      {upcoming.length === 0 ? (
        <T tone="secondary">Nothing planned in the next 90 days.</T>
      ) : (
        upcoming.map((u, i) => (
          <View key={u.key} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
            <Pressable
              onPress={() => router.push(u.href as never)}
              accessibilityRole="button"
              accessibilityLabel={`${u.title}, ${u.when}${u.progress ? `, ${u.progress}` : ''}, ${u.kind === 'income' ? 'income' : 'cost'} ${money(u.amount)}`}
              testID={`dashboard-upcoming-${i}`}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingVertical: Spacing.one }}>
              <IconBadge glyph={categoryEmoji(u.categoryId, u.kind)} color={categoryColor(u.categoryId, input.categories)} />
              <View style={{ flex: 1 }}>
                <T variant="label" numberOfLines={1}>
                  {u.title}
                </T>
                <T variant="caption" tone="secondary">
                  {u.when}
                  {u.progress ? ` · ${u.progress}` : ''}
                </T>
              </View>
              <T variant="number" tone={u.kind === 'income' ? 'positive' : 'negative'}>
                {u.kind === 'income' ? '+' : '-'}
                {money(u.amount)}
              </T>
            </Pressable>
            {reminders.on && u.kind === 'cost' ? (
              <Pressable
                onPress={() => ctx.toggleReminder(u)}
                accessibilityRole="switch"
                accessibilityState={{ checked: !reminders.muted.includes(u.refId) }}
                accessibilityLabel={`Reminder for ${u.title}`}
                testID={`upcoming-bell-${i}`}
                style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
                <T maxFontSizeMultiplier={1.3} tone={reminders.muted.includes(u.refId) ? 'secondary' : 'default'}>
                  {reminders.muted.includes(u.refId) ? '🔕' : '🔔'}
                </T>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => ctx.onPaid(u)}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${u.title} as ${u.kind === 'income' ? 'received' : 'paid'}`}
              testID={`upcoming-paid-${i}`}
              style={{ minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two, borderRadius: Radius.pill, borderWidth: 1, borderColor: c.border }}>
              <T variant="label" tone="accent" maxFontSizeMultiplier={1.3}>
                {u.kind === 'income' ? 'Got it' : 'Paid'}
              </T>
            </Pressable>
          </View>
        ))
      )}
    </Card>
  );
}
