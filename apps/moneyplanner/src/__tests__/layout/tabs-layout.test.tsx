// The tab bar must stay mounted while data reloads after a save: unmounting it
// (to show a spinner) reset the tabs to Home after every saved item.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import TabLayout from '@/app/(tabs)/_layout';
import { useRepoMutation } from '@/data/DataProvider';
import { defaultSettings } from '@/data/defaults';
import { renderWithRepo } from '../../../test-support/render';

jest.mock('expo-router/native-tabs', () => {
  const { Text: RNText, View } = jest.requireActual('react-native');
  const { useEffect } = jest.requireActual('react');
  const mounts = { count: 0 };
  function NativeTabs({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return <View testID="native-tabs">{children}</View>;
  }
  NativeTabs.Trigger = Object.assign(({ name }: { name: string }) => <RNText>{name}</RNText>, {
    Label: () => null,
    Icon: () => null,
  });
  return { NativeTabs, __mounts: mounts };
});

function Saver() {
  const write = useRepoMutation((r) => r.updateSettings({ buffer: 12345 }));
  return <Text onPress={() => write()}>save now</Text>;
}

it('keeps the tabs mounted (no spinner) while settings reload after a save', async () => {
  const { __mounts } = jest.requireMock('expo-router/native-tabs') as { __mounts: { count: number } };
  await renderWithRepo(
    <>
      <TabLayout />
      <Saver />
    </>,
    { settings: { ...defaultSettings(), onboarded: true } },
  );
  expect(await screen.findByTestId('native-tabs')).toBeTruthy();
  const before = __mounts.count;
  await act(async () => {
    fireEvent.press(screen.getByText('save now'));
  });
  await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
  expect(screen.getByTestId('native-tabs')).toBeTruthy();
  expect(screen.queryByLabelText('Loading')).toBeNull();
  expect(__mounts.count).toBe(before);
});
