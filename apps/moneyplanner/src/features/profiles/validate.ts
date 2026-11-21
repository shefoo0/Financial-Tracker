// Profile name rules (same as the profile store: 1-24 characters after trimming).
import { PROFILE_NAME_MAX } from '@/data/profiles/types';

export function validateProfileName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name for this profile.';
  if (trimmed.length > PROFILE_NAME_MAX) return `Use ${PROFILE_NAME_MAX} characters or fewer (now ${trimmed.length}).`;
  return null;
}

/** Names of the avatar colours, for screen readers (same order as Palette). */
export const COLOR_NAMES = ['Orange', 'Indigo', 'Green', 'Pink', 'Blue', 'Gold', 'Purple', 'Slate'] as const;

/** The first colour no profile uses yet (or the next one in turn). */
export function nextColor(used: number[], paletteSize: number): number {
  for (let i = 0; i < paletteSize; i++) if (!used.includes(i)) return i;
  return used.length % paletteSize;
}
