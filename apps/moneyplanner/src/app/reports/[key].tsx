// One report: hero summary, sections, and (Pro) Save as PDF. Free users see the sample.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, EmptyState, Screen, T } from '@/components/ui';
import { ReportView } from '@/features/reports/ReportView';
import { SampleBanner } from '@/features/reports/SampleBanner';
import { saveReportPdf } from '@/features/reports/pdf';
import { useReport } from '@/features/reports/useReports';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function ReportScreen() {
  const params = useLocalSearchParams<{ key: string }>();
  const key = first(params.key) ?? '';
  const { isPro, loading, error, reload, report } = useReport(key);
  const [saving, setSaving] = useState(false);

  if (error) {
    return (
      <Screen testID="report-screen">
        <EmptyState title="Couldn't load this report" message="Nothing has been lost. Try again." action={<Button label="Try again" onPress={reload} testID="report-retry" />} />
      </Screen>
    );
  }
  if (loading) {
    return (
      <Screen testID="report-screen">
        <T tone="secondary">Loading…</T>
      </Screen>
    );
  }
  if (!report) {
    return (
      <Screen testID="report-screen">
        <Stack.Screen options={{ title: 'Report' }} />
        <EmptyState title="Report not found" message="This period has not started yet, or the link is not valid." action={<Button label="Back to reports" onPress={() => router.back()} testID="report-back" />} />
      </Screen>
    );
  }

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveReportPdf(report);
    } catch (e) {
      Alert.alert("Couldn't save the PDF", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="report-screen">
      <Stack.Screen options={{ title: report.isSample ? `${report.period.label} (sample)` : report.period.label }} />
      <T variant="title" accessibilityRole="header">
        {report.title}
      </T>
      {!isPro ? <SampleBanner /> : null}
      <ReportView report={report} />
      {isPro ? (
        <Button label={saving ? 'Preparing PDF…' : 'Save as PDF'} onPress={save} disabled={saving} variant="secondary" testID="report-pdf" accessibilityHint="Creates a PDF of this report and opens the share sheet" />
      ) : null}
    </Screen>
  );
}
