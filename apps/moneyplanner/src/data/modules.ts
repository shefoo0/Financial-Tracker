// Which optional modules this build actually contains. The wizard and Settings
// only show switches for these, so the app never advertises a feature that
// does nothing. Owned by the lead: add a module here when its milestone ships.
import type { ModuleId } from '@/types';

export const MODULE_INFO: Record<ModuleId, { title: string; description: string }> = {
  debts: { title: 'Debts', description: 'Loans, credit cards and instalment plans' },
  cheques: { title: 'Cheques', description: 'Post-dated cheques, such as rent' },
  alerts: { title: 'Alerts', description: 'Warnings before money runs short' },
  import: { title: 'Statement import', description: 'Read bank and card statements' },
};

/** Modules built so far (the planner core is always on). Statement import comes in milestone 3. */
export const AVAILABLE_MODULES: ModuleId[] = ['debts', 'cheques', 'alerts'];
