// The root layout's real stack of providers: ProfileProvider > AlertScheduler > LockGate > app.
// Checks the per-profile lock across profile switches and that notifications follow the open profile.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { defaultSettings } from '@/data/defaults';
import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { ProfileProvider, useProfiles } from '@/data/profiles/ProfileProvider';
import type { BackupData } from '@/data/repository';
import { AlertScheduler } from '@/features/alerts/AlertScheduler';
import { GENERIC_BODY } from '@/features/alerts/plan';
import { LockGate } from '@/features/lock/LockGate';
import { lockStore } from '@/features/lock/lockStore';
import { throttle } from '@/features/lock/throttle';
import { addDays, today } from '@/lib/dates';

import { resetRouterMock } from '../../../test-support/expo-router-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
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
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

const N = Notifications as jest.Mocked<typeof Notifications>;
const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const base = { ...defaultSettings(), onboarded: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  throttle._resetAll();
  resetRouterMock();
});

const enter = async (pin: string) => {
  for (const d of pin) await fireEvent.press(screen.getByTestId(`lock-key-${d}`));
};

/** The app: shows the open profile's name and a button per profile to switch to. */
function App() {
  const { active, profiles, switchProfile } = useProfiles();
  return (
    <>
      <Text testID="app-profile">{active.name}</Text>
      {profiles.map((p) => (
        <Pressable key={p.id} testID={`switch-${p.name}`} onPress={() => switchProfile(p.id)}>
          <Text>{p.name}</Text>
        </Pressable>
      ))}
    </>
  );
}

/** Profile "Me" (seeded, first) plus "Partner". Each can be given a lock; returns the store and ids. */
async function setup(opts: { me?: Partial<BackupData>; mePin?: string | null; partnerLock?: { pin: string | null; seed?: Partial<BackupData> } | null }) {
  const store = createMemoryProfileStore({ seed: { settings: base, ...opts.me } });
  const { activeProfileId: meId } = await store.init();
  if (opts.mePin) await lockStore.setPin(meId, opts.mePin);
  const partner = await store.addProfile('Partner', 1);
  const partnerRepo = store.openRepository(partner);
  await partnerRepo.init();
  if (opts.partnerLock) {
    await partnerRepo.updateSettings({ onboarded: true, lockEnabled: true });
    if (opts.partnerLock.pin) await lockStore.setPin(partner.id, opts.partnerLock.pin);
  } else {
    await partnerRepo.updateSettings({ onboarded: true });
  }
  // Open "Me" first, like a fresh launch with the first profile active.
  await store.setActiveProfile(meId);
  const view = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ProfileProvider storeFactory={() => store} renderLoading={() => <Text>Loading</Text>} renderError={(m) => <Text>{m}</Text>}>
        <AlertScheduler />
        <LockGate>
          <App />
        </LockGate>
      </ProfileProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(view.queryByText('Loading')).toBeNull());
  return { store, meId, partnerId: partner.id, ...view };
}

describe('lock across profiles', () => {
  it('covers a locked profile on launch, unlocks with its PIN, and re-locks it after a switch round trip', async () => {
    await setup({ me: { settings: { ...base, lockEnabled: true } }, mePin: '1234' });
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    await enter('1234');
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    expect(screen.getByTestId('app-profile')).toHaveTextContent('Me');

    // Partner has no lock: opens straight away.
    await fireEvent.press(screen.getByTestId('switch-Partner'));
    await waitFor(() => expect(screen.getByTestId('app-profile')).toHaveTextContent('Partner'));
    expect(screen.queryByTestId('lock-screen')).toBeNull();

    // Back to Me: its earlier unlock does not carry over.
    await fireEvent.press(screen.getByTestId('switch-Me'));
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    await enter('1234');
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
  });

  it('locks the other profile on a switch and its PIN is its own (the first PIN does not open it)', async () => {
    await setup({ mePin: null, partnerLock: { pin: '5678' } });
    await waitFor(() => expect(screen.getByTestId('app-profile')).toHaveTextContent('Me'));
    expect(screen.queryByTestId('lock-screen')).toBeNull();

    await fireEvent.press(screen.getByTestId('switch-Partner'));
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    await enter('1234');
    expect(await screen.findByText(/Wrong PIN/)).toBeTruthy();
    expect(screen.getByTestId('lock-screen')).toBeTruthy();
    await enter('5678');
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    expect(screen.getByTestId('app-profile')).toHaveTextContent('Partner');
  });

  it('lockEnabled without a PIN is switched off instead of locking the user out', async () => {
    const { store, meId } = await setup({ me: { settings: { ...base, lockEnabled: true } }, mePin: null });
    await waitFor(async () => expect((await store.repositoryFor(meId)!.getSettings()).lockEnabled).toBe(false));
    await waitFor(() => expect(screen.queryByTestId('lock-cover')).toBeNull());
    expect(screen.queryByTestId('lock-screen')).toBeNull();
    expect(screen.getByTestId('app-profile')).toHaveTextContent('Me');
  });

  it('a profile that has a PIN stored but lockEnabled off is not locked', async () => {
    await setup({ mePin: '1234' });
    await waitFor(() => expect(screen.getByTestId('app-profile')).toHaveTextContent('Me'));
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });
});

describe('notifications follow the open profile', () => {
  // A cheque far larger than the balance gives an alert with a notification date in the future.
  const cheque = (payee: string) => ({
    id: `q-${payee}`,
    payee,
    amount: 99_000_000,
    date: addDays(today(), 20),
    purpose: '',
    status: 'upcoming' as const,
    seriesId: null,
    note: '',
  });

  it('cancels the old profile’s notifications on a switch and schedules the new one’s, with generic text while locked', async () => {
    const { store, partnerId } = await setup({ me: { cheques: [cheque('Landlord')], settings: base } });
    await store.repositoryFor(partnerId)!.upsertCheques([cheque('Garage')]);
    await store.repositoryFor(partnerId)!.updateSettings({ lockEnabled: true });
    await lockStore.setPin(partnerId, '5678');

    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalled(), { timeout: 4000 });
    const bodies = () => N.scheduleNotificationAsync.mock.calls.map(([r]) => (({ title, body }) => `${title} ${body}`)((r as { content: { title: string; body: string } }).content));
    expect(bodies().join()).toMatch(/Landlord/);
    expect(bodies().join()).not.toMatch(/Garage/);

    N.cancelAllScheduledNotificationsAsync.mockClear();
    N.scheduleNotificationAsync.mockClear();
    await fireEvent.press(screen.getByTestId('switch-Partner'));
    await waitFor(() => expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled());
    await waitFor(() => expect(N.scheduleNotificationAsync).toHaveBeenCalled(), { timeout: 4000 });
    // Partner is locked: generic wording, no payee or amount, and nothing from the first profile (the hidden alertId data is not shown).
    const text = bodies().join();
    expect(text).toContain(GENERIC_BODY);
    expect(text).not.toMatch(/Garage|Landlord|AED/);
  });
});
