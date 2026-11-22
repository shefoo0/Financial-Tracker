// Picked, photographed and shared files are copies in the app's cache: delete them once reading has ended.
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ImportInput } from '@/import/read';

/** Deletes the cached copy of a picked or shared file. Never throws. */
export function deleteInputFile(input: ImportInput | null | undefined): void {
  if (!input || input.kind !== 'file') return;
  try {
    const f = new File(input.uri);
    if (f.exists) f.delete();
  } catch {
    // already gone, or not ours to delete
  }
}

/** Tells expo-sharing to forget what was shared with the app (and delete its copies). Never throws (the web has no sharing in). */
export function discardShared(): void {
  try {
    Sharing.clearSharedPayloads();
  } catch {
    // nothing shared, or not supported here
  }
}
