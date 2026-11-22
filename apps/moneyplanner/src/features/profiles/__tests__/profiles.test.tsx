import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, Text } from 'react-native';

import ManageProfilesScreen from '@/app/profiles';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { MAX_PROFILES } from '@/data/profiles/types';
import { ProfileButton } from '@/features/profiles/ProfileButton';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

beforeEach(() => {
  resetRouterMock();
  jest.restoreAllMocks();
});

// Shows what the provider says, so tests can check that actions took effect.
function Probe() {
  const { active, profiles, appearance } = useProfiles();
  return <Text testID="probe">{`${active.name}|${profiles.map((p) => p.name).join(',')}|${appearance}`}</Text>;
}

async function renderApp(ui: React.ReactElement) {
  const result = await renderWithRepo(
    <>
      <Probe />
      {ui}
    </>,
  );
  await screen.findByTestId('probe');
  return result;
}

const probe = () => screen.getByTestId('probe').props.children as string;

async function addProfileViaSheet(name: string) {
  await fireEvent.press(screen.getByTestId('profile-button'));
  await fireEvent.press(await screen.findByTestId('profile-add'));
  await fireEvent.changeText(screen.getByTestId('profile-name-input'), name);
  await fireEvent.press(screen.getByTestId('profile-create'));
}

describe('profile switcher', () => {
  it('labels the button with the active profile and opens the sheet', async () => {
    await renderApp(<ProfileButton />);
    expect(screen.getByLabelText('Profile: Me. Switch profile')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('profile-button'));
    expect(await screen.findByTestId('profile-sheet')).toBeTruthy();
    expect(screen.getByTestId('profile-row-0')).toBeTruthy();
  });

  it('validates the name when adding, then adds and switches to the new profile', async () => {
    await renderApp(<ProfileButton />);
    await addProfileViaSheet('   ');
    expect(await screen.findByText('Enter a name for this profile.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('profile-name-input'), 'x'.repeat(25));
    await fireEvent.press(screen.getByTestId('profile-create'));
    expect(await screen.findByText(/Use 24 characters or fewer/)).toBeTruthy();
    expect(probe()).toBe('Me|Me|system');
    await fireEvent.changeText(screen.getByTestId('profile-name-input'), 'Layla');
    await fireEvent.press(screen.getByTestId('profile-create'));
    await waitFor(() => expect(probe()).toBe('Layla|Me,Layla|system'));
  });

  it('switches to another profile', async () => {
    await renderApp(<ProfileButton />);
    await addProfileViaSheet('Layla');
    await waitFor(() => expect(probe().startsWith('Layla')).toBe(true));
    await fireEvent.press(await screen.findByTestId('profile-button'));
    await fireEvent.press(await screen.findByTestId('profile-row-0'));
    await waitFor(() => expect(probe().startsWith('Me|')).toBe(true));
  });

  it('hides Add profile at the limit and says why', async () => {
    await renderApp(<ProfileButton />);
    for (let i = 1; i < MAX_PROFILES; i++) {
      await addProfileViaSheet(`P${i}`);
      await waitFor(() => expect(probe().startsWith(`P${i}|`)).toBe(true));
    }
    await fireEvent.press(await screen.findByTestId('profile-button'));
    expect(await screen.findByTestId('profile-limit-note')).toBeTruthy();
    expect(screen.queryByTestId('profile-add')).toBeNull();
  });

  it('has no appearance switch (that lives in Settings) and opens Manage profiles', async () => {
    await renderApp(<ProfileButton />);
    await fireEvent.press(screen.getByTestId('profile-button'));
    expect(await screen.findByTestId('profile-manage')).toBeTruthy();
    expect(screen.queryByTestId('appearance-segmented-dark')).toBeNull();
    await fireEvent.press(screen.getByTestId('profile-manage'));
    expect(router.push).toHaveBeenCalledWith('/profiles');
  });
});

describe('manage profiles', () => {
  // Starts with Me, then Layla added (and open), then back on Me... so Layla can be deleted.
  async function withTwoProfiles(openName: 'Me' | 'Layla') {
    await renderApp(
      <>
        <ProfileButton />
        <ManageProfilesScreen />
      </>,
    );
    await addProfileViaSheet('Layla');
    await waitFor(() => expect(probe().startsWith('Layla')).toBe(true));
    if (openName === 'Me') {
      await fireEvent.press(await screen.findByTestId('profile-button'));
      await fireEvent.press(await screen.findByTestId('profile-row-0'));
      await waitFor(() => expect(probe().startsWith('Me|')).toBe(true));
    }
  }

  it('offers delete for the only profile and for the open one', async () => {
    await renderApp(<ManageProfilesScreen />);
    expect(screen.getByTestId('profile-delete-0')).toBeTruthy();
    expect(screen.queryByText(/cannot be deleted/)).toBeNull();
  });

  it('renames a profile and validates the name', async () => {
    await renderApp(<ManageProfilesScreen />);
    await fireEvent.press(screen.getByTestId('profile-edit-0'));
    await fireEvent.changeText(screen.getByTestId('profile-edit-name-input'), '');
    await fireEvent.press(screen.getByTestId('profile-edit-save'));
    expect(await screen.findByText('Enter a name for this profile.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('profile-edit-name-input'), 'Sam');
    await fireEvent.press(screen.getByTestId('profile-edit-color-3'));
    await fireEvent.press(screen.getByTestId('profile-edit-save'));
    await waitFor(() => expect(probe().startsWith('Sam|')).toBe(true));
  });

  it('deletes only after the name is typed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await withTwoProfiles('Me');
    await fireEvent.press(screen.getByTestId('profile-delete-1'));
    expect(await screen.findByText(/safety copy is kept for 7 days/)).toBeTruthy();
    const confirm = screen.getByTestId('profile-delete-confirm');
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('profile-delete-input'), 'Lay');
    await fireEvent.press(screen.getByTestId('profile-delete-confirm'));
    expect(probe()).toBe('Me|Me,Layla|system');
    await fireEvent.changeText(screen.getByTestId('profile-delete-input'), 'Layla');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('profile-delete-confirm'));
    });
    await waitFor(() => expect(probe()).toBe('Me|Me|system'));
    expect(alert).not.toHaveBeenCalled();
  });

  it('deletes the open profile and opens the other one', async () => {
    await withTwoProfiles('Layla');
    await fireEvent.press(screen.getByTestId('profile-delete-1'));
    expect(await screen.findByText(/another profile opens afterwards/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('profile-delete-input'), 'Layla');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('profile-delete-confirm'));
    });
    await waitFor(() => expect(probe()).toBe('Me|Me|system'));
  });

  it('deleting the only profile starts a fresh "Me" with no data', async () => {
    await renderApp(<ManageProfilesScreen />);
    await fireEvent.press(screen.getByTestId('profile-delete-0'));
    expect(await screen.findByText(/only profile: a new empty profile "Me" starts/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('profile-delete-input'), 'Me');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('profile-delete-confirm'));
    });
    await waitFor(() => expect(probe()).toBe('Me|Me|system'));
  });
});
