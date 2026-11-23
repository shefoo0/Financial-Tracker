import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { AppState, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockSettingsScreen } from '@/features/settings/LockSettingsScreen';
import { defaultSettings } from '@/data/defaults';
import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { ProfileProvider } from '@/data/profiles/ProfileProvider';
import type { BackupData } from '@/data/repository';

import { resetRouterMock } from '../../../../test-support/expo-router-mock';
import { recurring, renderWithRepo } from '../../../../test-support/render';
import { LockGate } from '../LockGate';
import { clearProfileLock, lockStore } from '../lockStore';
import { MAX_TRIES, throttle, WAIT_MS, WAITS_MS } from '../throttle';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

const mockStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStorage.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStorage.delete(k)),
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_a: string, data: string) => `hash(${data})`),
    getRandomBytes: jest.fn((len: number) => Uint8Array.from({ length: len }, () => ++n % 256)),
  };
});
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const base = { ...defaultSettings(), onboarded: true };

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockStorage.clear();
  throttle._resetAll();
  resetRouterMock();
  LA.hasHardwareAsync.mockResolvedValue(false);
  LA.isEnrolledAsync.mockResolvedValue(false);
  LA.authenticateAsync.mockResolvedValue({ success: false } as never);
});

const enter = async (prefix: string, pin: string) => {
  for (const d of pin) await fireEvent.press(screen.getByTestId(`${prefix}-key-${d}`));
};

/** Renders the gate over a visible child with the profile "Me" already locked with `pin`. */
async function renderLocked(opts: { pin?: string | null; seed?: Partial<BackupData>; extraProfile?: string } = {}) {
  const pin = opts.pin === undefined ? '1234' : opts.pin;
  const store = createMemoryProfileStore({ seed: { settings: { ...base, lockEnabled: true }, ...opts.seed } });
  const { activeProfileId: id } = await store.init();
  if (pin) await lockStore.setPin(id, pin);
  if (opts.extraProfile) await store.addProfile(opts.extraProfile, 1);
  const view = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ProfileProvider storeFactory={() => store} renderLoading={() => <Text>Loading profiles</Text>} renderError={(m) => <Text>{m}</Text>}>
        <LockGate>
          <Text testID="secret">Secret balance</Text>
        </LockGate>
      </ProfileProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(view.queryByText('Loading profiles')).toBeNull());
  return { id, store, repo: store.repositoryFor(id)!, ...view };
}

describe('lockStore', () => {
  it('sets, verifies and clears a PIN without storing it', async () => {
    await lockStore.setPin('p1', '123456');
    expect(await lockStore.hasPin('p1')).toBe(true);
    expect(await lockStore.pinLength('p1')).toBe(6);
    expect(await lockStore.verifyPin('p1', '123456')).toBe(true);
    expect(await lockStore.verifyPin('p1', '123457')).toBe(false);
    expect(await lockStore.verifyPin('p2', '123456')).toBe(false);
    const [key, value] = [...mockStorage.entries()][0];
    expect(key).toContain('p1');
    expect(Object.keys(JSON.parse(value)).sort()).toEqual(['hash', 'len', 'salt']);
    await lockStore.clearPin('p1');
    expect(await lockStore.hasPin('p1')).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('rejects PINs that are not 4-6 digits', async () => {
    await expect(lockStore.setPin('p1', '123')).rejects.toThrow();
    await expect(lockStore.setPin('p1', '1234567')).rejects.toThrow();
    await expect(lockStore.setPin('p1', '12a4')).rejects.toThrow();
  });

  it('uses a different salt each time', async () => {
    await lockStore.setPin('p1', '1234');
    const a = mockStorage.get('moneyplanner.pin.p1');
    await lockStore.setPin('p1', '1234');
    expect(mockStorage.get('moneyplanner.pin.p1')).not.toBe(a);
  });
});

describe('throttle', () => {
  it('waits 30 seconds after 5 wrong tries', () => {
    for (let i = 1; i < MAX_TRIES; i++) expect(throttle.fail('p', 1000)).toBe(0);
    expect(throttle.fail('p', 1000)).toBe(WAIT_MS);
    expect(throttle.remaining('p', 1000 + 10_000)).toBe(WAIT_MS - 10_000);
    expect(throttle.remaining('p', 1000 + WAIT_MS)).toBe(0);
  });
});

describe('throttle persistence and escalation', () => {
  it('waits longer each time and survives a restart', async () => {
    for (let i = 0; i < MAX_TRIES; i++) throttle.fail('q', 0);
    expect(throttle.remaining('q', 1)).toBe(WAITS_MS[0] - 1);
    for (let i = 0; i < MAX_TRIES; i++) throttle.fail('q', WAITS_MS[0] + 5);
    expect(throttle.remaining('q', WAITS_MS[0] + 6)).toBe(WAITS_MS[1] - 1);
    await new Promise((r) => setTimeout(r, 0));
    throttle._resetAll(); // app restarted: memory is gone, secure storage is not
    expect(throttle.remaining('q', WAITS_MS[0] + 6)).toBe(0);
    await throttle.hydrate('q');
    expect(throttle.remaining('q', WAITS_MS[0] + 6)).toBe(WAITS_MS[1] - 1);
  });

  it('clearProfileLock removes the PIN, the Face ID choice and the wait', async () => {
    await lockStore.setPin('z', '1234');
    await lockStore.setBiometricPref('z', false);
    throttle.fail('z');
    await new Promise((r) => setTimeout(r, 0));
    await clearProfileLock('z');
    expect([...mockStorage.keys()].filter((k) => k.endsWith('.z'))).toEqual([]);
  });
});

describe('LockGate', () => {
  it('shows the lock screen over a locked profile and unlocks with the right PIN', async () => {
    await renderLocked();
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    // The app itself is not rendered at all while locked, so no modal can show above the lock.
    expect(screen.queryByTestId('secret')).toBeNull();
    await enter('lock', '1111');
    expect(await screen.findByText('Wrong PIN. 4 tries left.')).toBeTruthy();
    expect(screen.getByTestId('lock-dots').props.accessibilityLabel).toBe('0 of 4 digits entered');
    await fireEvent.press(screen.getByTestId('lock-key-1'));
    expect(screen.getByTestId('lock-dots').props.accessibilityLabel).toBe('1 of 4 digits entered');
    await fireEvent.press(screen.getByTestId('lock-delete'));
    await enter('lock', '1234');
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    expect(await screen.findByTestId('secret')).toBeTruthy();
  });

  it('shows no lock screen when the profile is not locked', async () => {
    const store = createMemoryProfileStore({ seed: { settings: base } });
    const view = await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <ProfileProvider storeFactory={() => store} renderLoading={() => <Text>Loading profiles</Text>} renderError={(m) => <Text>{m}</Text>}>
          <LockGate>
            <Text testID="secret">Secret</Text>
          </LockGate>
        </ProfileProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(view.queryByTestId('lock-cover')).toBeNull());
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('makes you wait 30 seconds after 5 wrong tries', async () => {
    await renderLocked();
    await screen.findByTestId('lock-screen');
    for (let i = 0; i < MAX_TRIES; i++) await enter('lock', '9999');
    expect(await screen.findByText(/Too many wrong tries\. Try again in 30 seconds\./)).toBeTruthy();
    expect(screen.getByTestId('lock-key-1').props.accessibilityState.disabled).toBe(true);
    // Even the right PIN does nothing during the wait.
    await enter('lock', '1234');
    expect(screen.getByTestId('lock-screen')).toBeTruthy();
  });

  it('unlocks with biometrics as the screen appears', async () => {
    LA.hasHardwareAsync.mockResolvedValue(true);
    LA.isEnrolledAsync.mockResolvedValue(true);
    LA.authenticateAsync.mockResolvedValue({ success: true } as never);
    await renderLocked();
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    expect(LA.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('offers a biometric button when the automatic prompt is cancelled', async () => {
    LA.hasHardwareAsync.mockResolvedValue(true);
    LA.isEnrolledAsync.mockResolvedValue(true);
    await renderLocked();
    const button = await screen.findByTestId('lock-biometric');
    await waitFor(() => expect(LA.authenticateAsync).toHaveBeenCalledTimes(1));
    LA.authenticateAsync.mockResolvedValue({ success: true } as never);
    await fireEvent.press(button);
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
  });

  it('hides the biometric button when the phone has none', async () => {
    await renderLocked();
    await screen.findByTestId('lock-screen');
    expect(screen.queryByTestId('lock-biometric')).toBeNull();
  });

  it('forgot PIN: deleting the only profile needs the typed name, clears the PIN and starts a fresh Me', async () => {
    const { id, store } = await renderLocked({ seed: { recurring: [recurring({ id: 'r1', name: 'Rent', kind: 'cost', amount: 100000 })] } });
    await fireEvent.press(await screen.findByTestId('lock-forgot'));
    expect(await screen.findByText(/only way back in is to delete this profile/)).toBeTruthy();
    expect(screen.getByText(/only profile, so a new empty profile starts/)).toBeTruthy();
    expect(screen.getByTestId('lock-delete-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('lock-confirm-input'), 'Someone');
    expect(screen.getByTestId('lock-delete-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('lock-confirm-input'), 'Me');
    await fireEvent.press(screen.getByTestId('lock-delete-confirm'));
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    expect(await lockStore.hasPin(id)).toBe(false);
    const after = await store.init();
    expect(after.profiles.map((p) => p.name)).toEqual(['Me']);
    expect(after.profiles[0].id).not.toBe(id);
    expect(store.repositoryFor(id)).toBeUndefined();
  });

  it('forgot PIN: offers to switch to another profile', async () => {
    await renderLocked({ extraProfile: 'Partner' });
    await fireEvent.press(await screen.findByTestId('lock-forgot'));
    await fireEvent.press(await screen.findByLabelText('Switch to Partner'));
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    expect(await screen.findByTestId('secret')).toBeTruthy();
  });

  it('does not offer switching with a single profile', async () => {
    await renderLocked();
    await fireEvent.press(await screen.findByTestId('lock-forgot'));
    expect(screen.queryByTestId('lock-switch-0')).toBeNull();
  });

  describe('re-lock', () => {
    const handlers: ((s: string) => void)[] = [];
    beforeEach(() => {
      handlers.length = 0;
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
        handlers.push(h);
        return { remove: () => undefined };
      }) as never);
    });
    const send = (s: string) => act(() => handlers.forEach((h) => h(s)));

    it('locks again after more than 60 seconds in the background, not before', async () => {
      await renderLocked();
      await screen.findByTestId('lock-screen');
      await enter('lock', '1234');
      await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());

      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      await send('background');
      now += 30_000;
      await send('active');
      expect(screen.queryByTestId('lock-screen')).toBeNull();

      await send('background');
      now += 61_000;
      await send('active');
      expect(await screen.findByTestId('lock-screen')).toBeTruthy();
      expect(screen.queryByTestId('secret')).toBeNull();
    });
  });

  it('fails closed when the PIN cannot be read', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('keychain locked'));
    const { repo } = await renderLocked();
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    expect(screen.queryByTestId('secret')).toBeNull();
    expect((await repo.getSettings()).lockEnabled).toBe(true);
    expect(screen.getByTestId('lock-forgot')).toBeTruthy();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) => mockStorage.get(k) ?? null);
  });

  it('covers the screen while the app is inactive, without locking', async () => {
    const handlers: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: () => undefined };
    }) as never);
    await renderLocked();
    await enter('lock', '1234');
    await waitFor(() => expect(screen.queryByTestId('secret')).toBeTruthy());
    await act(() => handlers.forEach((h) => h('inactive')));
    expect(screen.getByTestId('privacy-cover')).toBeTruthy();
    await act(() => handlers.forEach((h) => h('active')));
    expect(screen.queryByTestId('privacy-cover')).toBeNull();
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('switches off a lock whose PIN is missing (e.g. restored on another phone)', async () => {
    const { repo } = await renderLocked({ pin: null });
    await waitFor(async () => expect((await repo.getSettings()).lockEnabled).toBe(false));
    await waitFor(() => expect(screen.queryByTestId('lock-cover')).toBeNull());
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });
});

describe('Settings -> Lock', () => {
  const idOf = async (store: { init(): Promise<{ activeProfileId: string }> }) => (await store.init()).activeProfileId;

  it('sets a PIN by entering it twice', async () => {
    const { repo, store } = await renderWithRepo(<LockSettingsScreen />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-lock-toggle'));
    await enter('pin', '2468');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    expect(await screen.findByText('Enter the same PIN again.')).toBeTruthy();
    await enter('pin', '2468');
    await waitFor(async () => expect((await repo.getSettings()).lockEnabled).toBe(true));
    expect(await lockStore.verifyPin(await idOf(store), '2468')).toBe(true);
  });

  it('rejects a second entry that differs', async () => {
    const { repo, store } = await renderWithRepo(<LockSettingsScreen />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-lock-toggle'));
    await enter('pin', '2468');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    await enter('pin', '2469');
    expect(await screen.findByText("The two PINs didn't match. Choose a PIN again.")).toBeTruthy();
    expect(await lockStore.hasPin(await idOf(store))).toBe(false);
    expect((await repo.getSettings()).lockEnabled).toBe(false);
  });

  it('needs at least 4 digits', async () => {
    await renderWithRepo(<LockSettingsScreen />, { settings: base });
    await fireEvent.press(await screen.findByTestId('settings-lock-toggle'));
    await enter('pin', '12');
    expect(screen.getByTestId('pin-submit').props.accessibilityState.disabled).toBe(true);
  });

  async function withPin() {
    const view = await renderWithRepo(<LockSettingsScreen />, { settings: { ...base, lockEnabled: true } });
    const id = await idOf(view.store);
    await lockStore.setPin(id, '1234');
    return { ...view, id };
  }

  it('changes the PIN after asking for the current one', async () => {
    const { id } = await withPin();
    await fireEvent.press(await screen.findByTestId('settings-lock-change'));
    await enter('pin', '0000');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    expect(await screen.findByText('That is not the current PIN.')).toBeTruthy();
    await enter('pin', '1234');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    expect(await screen.findByText(/Choose a PIN of 4 to 6 digits/)).toBeTruthy();
    await enter('pin', '5555');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    await enter('pin', '5555');
    await waitFor(async () => expect(await lockStore.verifyPin(id, '5555')).toBe(true));
    expect(await lockStore.verifyPin(id, '1234')).toBe(false);
  });

  it('turns the lock off only with the PIN', async () => {
    const { repo, id } = await withPin();
    await fireEvent.press(await screen.findByTestId('settings-lock-toggle'));
    await enter('pin', '9999');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    expect(await screen.findByText('That is not the current PIN.')).toBeTruthy();
    expect((await repo.getSettings()).lockEnabled).toBe(true);
    await enter('pin', '1234');
    await fireEvent.press(screen.getByTestId('pin-submit'));
    await waitFor(async () => expect((await repo.getSettings()).lockEnabled).toBe(false));
    expect(await lockStore.hasPin(id)).toBe(false);
  });

  it('shows the biometric switch only when the phone has biometrics, and saves it', async () => {
    LA.hasHardwareAsync.mockResolvedValue(true);
    LA.isEnrolledAsync.mockResolvedValue(true);
    const { id } = await withPin();
    const toggle = await screen.findByTestId('settings-lock-biometric');
    await fireEvent.press(toggle);
    await waitFor(async () => expect(await lockStore.getBiometricPref(id)).toBe(false));
  });

  it('hides the biometric switch without biometrics', async () => {
    await withPin();
    await screen.findByTestId('settings-lock-change');
    expect(screen.queryByTestId('settings-lock-biometric')).toBeNull();
  });
});
