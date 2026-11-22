// Dashboard card: the current alerts, most serious first. Renders nothing when there are none.
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Card, IconBadge, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AppAlert } from '@/types';
import { alertRoute } from './plan';
import { useAlerts } from './useAlerts';

const GLYPH = { good: '✓', info: 'i', caution: '!', high: '⚠' } as const;
const SEVERITY_WORD = { good: 'Good news', info: 'Note', caution: 'Caution', high: 'Warning' } as const;

export function AlertsCard({ limit }: { limit?: number }) {
  const alerts = useAlerts();
  const router = useRouter();
  const c = useTheme();
  if (alerts.length === 0) return null;
  const color = { good: c.positive, info: c.accent, caution: c.warning, high: c.negative } as const;
  const shown: AppAlert[] = limit ? alerts.slice(0, limit) : alerts;
  return (
    <Card testID="alerts-card">
      <T variant="heading" accessibilityRole="header">
        Alerts
      </T>
      {shown.map((a, i) => (
        <Pressable
          key={a.id}
          onPress={() => router.push(alertRoute(a.kind) as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${SEVERITY_WORD[a.severity]}. ${a.title}. ${a.message}`}
          accessibilityHint="Opens the related screen"
          testID={`alert-${i}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
          <IconBadge glyph={GLYPH[a.severity]} color={color[a.severity]} />
          <View style={{ flex: 1 }}>
            <T variant="label">{a.title}</T>
            <T variant="caption" tone="secondary">
              {a.message}
            </T>
          </View>
        </Pressable>
      ))}
    </Card>
  );
}
