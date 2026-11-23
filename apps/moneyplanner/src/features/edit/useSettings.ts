import { usePlanInput } from '@/data/DataProvider';
import type { Settings } from '@/types';

/** The saved settings (the app-wide copy, refreshed after every write), or undefined while they load. */
export function useSettings(): { settings: Settings | undefined; error: Error | null; reload: () => void } {
  const { data, error, reload } = usePlanInput();
  return { settings: data?.settings, error, reload };
}
