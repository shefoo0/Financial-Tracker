import { usePlanInput } from '@/data/DataProvider';
import { buildAlerts } from '@/engine';
import type { AppAlert } from '@/types';
import { sortBySeverity } from './plan';
import { useDay } from './useDay';

/** The current alerts of the open profile (empty while loading), most serious first. */
export function useAlerts(): AppAlert[] {
  const { data } = usePlanInput();
  const day = useDay();
  if (!data) return [];
  return sortBySeverity(buildAlerts(data, day));
}
