// Pro gate for every way into import, and the lock: a free user always lands on the Pro screen and nothing is read;
// a share that arrives while the profile is locked shows nothing until the PIN is entered.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useIncomingShare } from 'expo-sharing';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';

import { defaultSettings } from '@/data/defaults';
import { createMemoryProfileStore } from '@/data/profiles/memory-profile-store';
import { ProfileProvider } from '@/data/profiles/ProfileProvider';
import { LockGate } from '@/features/lock/LockGate';
import { lockStore } from '@/features/lock/lockStore';
import { throttle } from '@/features/lock/throttle';
import { ModuleCards } from '@/features/plan/ModuleCards';
import { QuickAddButton } from '@/features/quickadd/QuickAddButton';
import { readImport } from '@/import/read';
import { readBytes } from '@/import/read/files';
import type { PlanInput } from '@/types';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import ColumnsScreen from '../ColumnsScreen';
import { IncomingShareHandler, resetSeenShare } from '../IncomingShareHandler';
import ImportScreen from '../ImportScreen';
import ReviewScreen from '../ReviewScreen';
import { getSession, resetSession, setSession } from '../session';

jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...require('../../../../test-support/expo-router-mock'),
  useRootNavigationState: () => ({ key: 'root' }),
}));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-sharing', () => ({ useIncomingShare: jest.fn(), clearSharedPayloads: jest.fn() }));
let mockPro = false;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));
jest.mock('@/import/ocr/native', () => ({ ocrNative: {} }));
jest.mock('@/import/pdf/native', () => ({ pdfNative: {} }));
jest.mock('@/import/read', () => {
  const actual = jest.requireActual('@/import/read');
  return { ...actual, readImport: jest.fn(actual.readImport) };
});
jest.mock('@/import/read/files', () => ({ readBytes: jest.fn(), fileSize: jest.fn(async () => null) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
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

const SAFE_AREA = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const settings = { ...defaultSettings(), onboarded: true };
const SMS = 'Purchase of AED 45.00 at CAREEM on 21-11-2026 12:30 using card ending 1234. Avl Bal AED 2,345.10.';
const CSV = 'Date,Description,Debit,Credit\n03/11/2026,SALARY,,100.00\n05/11/2026,COFFEE,5.00,\n';
const planInput = { settings: defaultSettings(), cheques: [], debts: [] } as unknown as PlanInput;
const clear = jest.fn();
const share = (over: Partial<ReturnType<typeof useIncomingShare>>) =>
  (useIncomingShare as jest.Mock).mockReturnValue({
    sharedPayloads: [], resolvedSharedPayloads: [], isResolving: false, error: null, clearSharedPayloads: clear, refreshSharePayloads: jest.fn(), ...over,
  });
const FILE_SHARE = {
  sharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' as const }],
  resolvedSharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' as const, contentUri: 'file:///c/s.csv', contentType: 'file' as const, contentMimeType: 'text/csv', originalName: 's.csv', contentSize: 5 }],
};
const TEXT_SHARE = { sharedPayloads: [{ value: SMS, shareType: 'text' as const }] };

const neverRead = () => {
  expect(readImport).not.toHaveBeenCalled();
  expect(readBytes).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalledWith('/import/review');
  expect(router.push).not.toHaveBeenCalledWith('/import/columns');
  expect(getSession().result).toBeNull();
};
const proScreen = async () => {
  expect(await screen.findByTestId('import-unlock')).toBeTruthy();
  expect(screen.getByTestId('import-pro-badge')).toBeTruthy();
  for (const id of ['import-choose-file', 'import-paste-sms', 'import-read', 'review-import', 'review-row-0', 'columns-apply']) {
    expect(screen.queryByTestId(id)).toBeNull();
  }
};

beforeEach(() => {
  resetRouterMock();
  resetSession();
  resetSeenShare();
  mockPro = false;
  mockStorage.clear();
  throttle._resetAll();
  jest.clearAllMocks();
  share({});
});

describe('free user: every way into import ends on the Pro screen and reads nothing', () => {
  it('Plan card opens /import, and /import is the Pro screen', async () => {
    await render(<ModuleCards input={planInput} />);
    await fireEvent.press(screen.getByTestId('plan-open-import'));
    expect(router.push).toHaveBeenCalledWith('/import');
    await renderWithRepo(<ImportScreen />, { settings });
    await proScreen();
    neverRead();
  });

  it('quick add opens /import, and /import is the Pro screen', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QuickAddButton />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByTestId('quick-add'));
    await fireEvent.press(await screen.findByTestId('quick-add-import'));
    expect(router.push).toHaveBeenCalledWith('/import');
    await renderWithRepo(<ImportScreen />, { settings });
    await proScreen();
    neverRead();
  });

  it('a file shared into the app opens /import: Pro screen, file never read, shared item dropped', async () => {
    share(FILE_SHARE);
    (readBytes as jest.Mock).mockResolvedValue(new TextEncoder().encode(CSV));
    await renderWithRepo(<><IncomingShareHandler /><ImportScreen /></>, { settings });
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    await proScreen();
    await waitFor(() => expect(getSession().incoming).toBeNull());
    neverRead();
  });

  it('a text shared into the app opens /import: Pro screen, text never read, shared item dropped', async () => {
    share(TEXT_SHARE);
    await renderWithRepo(<><IncomingShareHandler /><ImportScreen /></>, { settings });
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    await proScreen();
    await waitFor(() => expect(getSession().incoming).toBeNull());
    neverRead();
  });

  it('going straight to /import/review shows the Pro screen, even with rows left in the session', async () => {
    setSession({
      result: { rows: [{ date: '2026-11-20', description: 'X', amount: 1000, kind: 'cost', raw: '', confidence: 1, warnings: [] }], source: 'csv', problems: [] },
      sourceName: 'old.csv',
      fileKind: 'csv',
    });
    await renderWithRepo(<ReviewScreen />, { settings });
    await proScreen();
    expect(screen.queryByTestId('review-screen')).toBeNull();
    expect(readImport).not.toHaveBeenCalled();
  });

  it('going straight to /import/columns shows the Pro screen, even with a table in the session', async () => {
    setSession({ table: { rows: [['d', 'x'], ['03/11/2026', 'COFFEE']], delimiter: ',' }, sourceName: 'old.csv', fileKind: 'csv' });
    await renderWithRepo(<ColumnsScreen />, { settings });
    await proScreen();
    expect(screen.queryByTestId('columns-preview')).toBeNull();
    expect(readImport).not.toHaveBeenCalled();
  });
});

describe('the lock', () => {
  const enter = async (pin: string) => {
    for (const d of pin) await fireEvent.press(screen.getByTestId(`lock-key-${d}`));
  };

  /** The root layout's order: ProfileProvider > LockGate > share handler + the import screen. */
  async function lockedApp() {
    mockPro = true;
    const store = createMemoryProfileStore({ seed: { settings: { ...settings, lockEnabled: true } } });
    const { activeProfileId } = await store.init();
    await lockStore.setPin(activeProfileId, '1234');
    const view = await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <ProfileProvider storeFactory={() => store} renderLoading={() => <Text>Loading</Text>} renderError={(m) => <Text>{m}</Text>}>
          <LockGate>
            <IncomingShareHandler />
            <ImportScreen />
          </LockGate>
        </ProfileProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(view.queryByText('Loading')).toBeNull());
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    return view;
  }

  it('a shared bank SMS arriving while locked shows nothing and reads nothing until the PIN is entered', async () => {
    share(TEXT_SHARE);
    await lockedApp();
    // Give any wrongly mounted receiver time to act.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('lock-screen')).toBeTruthy();
    expect(screen.queryByTestId('import-screen')).toBeNull();
    expect(screen.queryByTestId('review-screen')).toBeNull();
    expect(screen.queryByText(/CAREEM/)).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(getSession().incoming).toBeNull();
    expect(readImport).not.toHaveBeenCalled();

    await enter('0000');
    expect(await screen.findByText(/Wrong PIN/)).toBeTruthy();
    expect(screen.queryByTestId('import-screen')).toBeNull();
    expect(readImport).not.toHaveBeenCalled();

    await enter('1234');
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull());
    // Unlocked: now the share is picked up and read.
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(readImport).toHaveBeenCalledTimes(1);
    expect(getSession().result?.rows).toMatchObject([{ description: 'CAREEM', amount: 4500 }]);
  });

  it('a shared file arriving while locked is not opened until the PIN is entered', async () => {
    (readBytes as jest.Mock).mockResolvedValue(new TextEncoder().encode(CSV));
    share(FILE_SHARE);
    await lockedApp();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('import-screen')).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(readBytes).not.toHaveBeenCalled();
    expect(readImport).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    await enter('1234');
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(getSession().result?.rows).toHaveLength(2);
  });
});
