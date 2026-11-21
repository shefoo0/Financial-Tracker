import { useContext } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { AppearanceContext } from '@/data/profiles/ProfileProvider';

/** 'light' or 'dark': the Appearance setting (Settings), or the phone's when it's System. */
export function useColorScheme(): 'light' | 'dark' {
  const setting = useContext(AppearanceContext);
  const system = useSystemColorScheme();
  if (setting !== 'system') return setting;
  return system === 'dark' ? 'dark' : 'light';
}
