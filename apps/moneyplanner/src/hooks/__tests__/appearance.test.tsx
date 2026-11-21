import { act, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import * as RN from 'react-native';

import { Colors } from '@/constants/theme';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

import { renderWithRepo } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

let api: ReturnType<typeof useProfiles>;
function Probe() {
  const profiles = useProfiles();
  useEffect(() => {
    api = profiles;
  });
  const scheme = useColorScheme();
  const theme = useTheme();
  return <Text testID="p">{`${scheme}|${theme.background}`}</Text>;
}
const out = () => screen.getByTestId('p').props.children as string;

afterEach(() => jest.restoreAllMocks());

describe('Appearance', () => {
  it('System follows the phone (light and dark)', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    await renderWithRepo(<Probe />);
    expect(out()).toBe(`dark|${Colors.dark.background}`);
  });

  it('System with no phone setting falls back to light', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue(null);
    await renderWithRepo(<Probe />);
    expect(out()).toBe(`light|${Colors.light.background}`);
  });

  it('Light and Dark override the phone, update the tokens and persist in the store', async () => {
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
    const { store } = await renderWithRepo(<Probe />);
    expect(Colors.light.background).not.toBe(Colors.dark.background);
    await act(async () => api.setAppearance('dark'));
    await waitFor(() => expect(out()).toBe(`dark|${Colors.dark.background}`));
    expect((await store.init()).appearance).toBe('dark');
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    await act(async () => api.setAppearance('light'));
    await waitFor(() => expect(out()).toBe(`light|${Colors.light.background}`));
    expect((await store.init()).appearance).toBe('light');
    await act(async () => api.setAppearance('system'));
    await waitFor(() => expect(out()).toBe(`dark|${Colors.dark.background}`));
    expect((await store.init()).appearance).toBe('system');
  });
});
