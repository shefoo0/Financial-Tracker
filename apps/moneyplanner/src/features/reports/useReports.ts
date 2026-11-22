import { useMemo } from 'react';

import { usePlanInput } from '@/data/DataProvider';
import { buildReport, periodForKey, periodsWithData, sampleReport, type Report, type ReportPeriod } from '@/engine';
import { useToday } from '@/features/dashboard/useToday';
import { usePro } from '@/lib/pro';

/**
 * Free users get the sample reports only: their own data is never turned into figures here.
 * Pro users get the periods that have data.
 */
export function useReportList() {
  const { isPro, loading: proLoading } = usePro();
  const { data, error, reload } = usePlanInput();
  const today = useToday();
  const periods = useMemo<ReportPeriod[]>(() => (isPro && data ? periodsWithData(data, today) : []), [isPro, data, today]);
  const samples = useMemo<Report[]>(() => (isPro ? [] : [sampleReport(today, 'quarter'), sampleReport(today, 'year')]), [isPro, today]);
  return { isPro, loading: proLoading || (isPro && !data && !error), error: isPro ? error : null, reload, periods, samples, today, currency: data?.settings.currency ?? 'AED' };
}

export function useReport(key: string) {
  const { isPro, loading: proLoading } = usePro();
  const { data, error, reload } = usePlanInput();
  const today = useToday();
  const report = useMemo<Report | null>(() => {
    if (!isPro) return sampleReport(today, /^\d{4}$/.test(key) ? 'year' : 'quarter');
    const period = periodForKey(key, today);
    if (!data || !period || period.from > today) return null;
    return buildReport(data, period, today);
  }, [isPro, data, key, today]);
  return { isPro, loading: proLoading || (isPro && !data && !error), error: isPro ? error : null, reload, report };
}
