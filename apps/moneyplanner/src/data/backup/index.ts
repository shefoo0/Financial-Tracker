// STUB — task T2 replaces these. The signatures are the contract the Settings
// screen uses: keep them (adding is fine).
import type { BackupData, Repository } from '@/data/repository';

/** Turns a backup into the text written to a .json file. */
export function serializeBackup(_data: BackupData): string {
  throw new Error('backup: not implemented yet (task T2)');
}

/** Reads backup file text. Throws an Error with a user-friendly message if it isn't a valid backup. */
export function parseBackup(_text: string): BackupData {
  throw new Error('backup: not implemented yet (task T2)');
}

/** Writes a backup file and opens the share sheet so the user can save it (Files, Drive, email...). */
export async function exportBackup(_repo: Repository): Promise<void> {
  throw new Error('backup: not implemented yet (task T2)');
}

/** Lets the user pick a backup file and, after `confirm()` resolves true, replaces all data with it. */
export async function restoreBackupFromFile(
  _repo: Repository,
  _confirm: (summary: { exportedAt: string; recurring: number; transactions: number }) => Promise<boolean>,
): Promise<'restored' | 'cancelled'> {
  throw new Error('backup: not implemented yet (task T2)');
}

/** Writes all one-time items as a CSV file and opens the share sheet. */
export async function exportTransactionsCsv(_repo: Repository): Promise<void> {
  throw new Error('backup: not implemented yet (task T2)');
}
