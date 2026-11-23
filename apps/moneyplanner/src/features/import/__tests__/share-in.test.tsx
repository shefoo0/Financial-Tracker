import { clearSharedPayloads, useIncomingShare } from 'expo-sharing';
import { screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { readImport } from '@/import/read';
import { defaultSettings } from '@/data/defaults';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import { IncomingShareHandler, resetSeenShare, shareToInput } from '../IncomingShareHandler';
import ImportScreen from '../ImportScreen';
import { getSession, resetSession } from '../session';

jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...require('../../../../test-support/expo-router-mock'),
  useRootNavigationState: () => ({ key: 'root' }),
}));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-sharing', () => ({ useIncomingShare: jest.fn(), clearSharedPayloads: jest.fn() }));
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({ File: class { exists = true; uri: string; constructor(u: string) { this.uri = u; } delete() { mockDelete(this.uri); } } }));
let mockPro = true;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));
jest.mock('@/import/ocr/native', () => ({ ocrNative: {} }));
jest.mock('@/import/pdf/native', () => ({ pdfNative: {} }));
jest.mock('@/import/read', () => {
  const actual = jest.requireActual('@/import/read');
  return { ...actual, readImport: jest.fn(actual.readImport) };
});
jest.mock('@/import/read/files', () => ({ readBytes: jest.fn(), fileSize: jest.fn(async () => null) }));

const SMS = 'Purchase of AED 45.00 at CAREEM on 21-11-2026 12:30 using card ending 1234. Avl Bal AED 2,345.10.';
const ready = { ...defaultSettings(), onboarded: true };
const settings = { settings: ready };
const clear = jest.fn();
const share = (over: Partial<ReturnType<typeof useIncomingShare>>) =>
  (useIncomingShare as jest.Mock).mockReturnValue({
    sharedPayloads: [], resolvedSharedPayloads: [], isResolving: false, error: null, clearSharedPayloads: clear, refreshSharePayloads: jest.fn(), ...over,
  });

beforeEach(() => {
  resetRouterMock();
  resetSession();
  resetSeenShare();
  mockPro = true;
  jest.clearAllMocks();
});

describe('shareToInput', () => {
  it('turns text into pasted text and a file into a file input, and ignores URLs and empty shares', () => {
    expect(shareToInput([{ value: ' hi ', shareType: 'text' }], [])).toEqual({ kind: 'text', text: ' hi ' });
    expect(shareToInput([{ value: 'file:///c/a.pdf', shareType: 'file' }], [
      { value: 'file:///c/a.pdf', shareType: 'file', contentUri: 'file:///c/a.pdf', contentType: 'file', contentMimeType: 'application/pdf', originalName: 'stmt.pdf', contentSize: 1 },
    ])).toEqual({ kind: 'file', uri: 'file:///c/a.pdf', name: 'stmt.pdf', mimeType: 'application/pdf' });
    expect(shareToInput([{ value: 'https://example.com', shareType: 'url' }], [])).toBeNull();
    expect(shareToInput([{ value: '  ', shareType: 'text' }], [])).toBeNull();
  });
});

describe('incoming shares', () => {
  it('open /import with a shared bank SMS (text) and let go of the shared copy', async () => {
    share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
    await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    expect(getSession().incoming).toEqual({ kind: 'text', text: SMS });
    expect(clear).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('open /import with a shared file, which stays until it has been read', async () => {
    share({
      sharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' }],
      resolvedSharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file', contentUri: 'file:///c/s.csv', contentType: 'file', contentMimeType: 'text/csv', originalName: 's.csv', contentSize: 5 }],
    });
    await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    expect(getSession().incoming).toEqual({ kind: 'file', uri: 'file:///c/s.csv', name: 's.csv', mimeType: 'text/csv' });
    expect(clear).not.toHaveBeenCalled();
  });

  it('wait while a file is still being resolved, and do nothing when nothing was shared', async () => {
    share({ sharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' }], isResolving: true });
    await renderWithRepo(<IncomingShareHandler />, settings);
    share({});
    await renderWithRepo(<IncomingShareHandler />, settings);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('wait for the setup wizard to finish, then open', async () => {
    share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
    await renderWithRepo(<IncomingShareHandler />, { settings: { ...ready, onboarded: false } });
    await new Promise((r) => setTimeout(r, 50));
    expect(router.navigate).not.toHaveBeenCalled();
    expect(getSession().incoming).toBeNull();
  });

  it('do not open the same share again after the handler is remounted (re-lock), but open a new share of the same file later', async () => {
    const f = { sharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' as const }], resolvedSharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' as const, contentUri: 'file:///c/s.csv', contentType: 'file' as const, contentMimeType: 'text/csv', originalName: 's.csv', contentSize: 5 }] };
    share(f);
    const first = await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1));
    await first.unmount();
    await renderWithRepo(<IncomingShareHandler />, settings);
    await new Promise((r) => setTimeout(r, 50));
    expect(router.navigate).toHaveBeenCalledTimes(1);
    // The share was cleared (nothing shared), then the same file is shared again: it opens again.
    share({});
    await renderWithRepo(<IncomingShareHandler />, settings);
    share(f);
    await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(2));
  });

  it('do nothing on the web, where sharing in does not exist', async () => {
    const os = Platform.OS;
    Platform.OS = 'web';
    try {
      share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
      await renderWithRepo(<IncomingShareHandler />, settings);
      expect(router.navigate).not.toHaveBeenCalled();
    } finally {
      Platform.OS = os;
    }
  });

  it('explain on the Import screen when what was shared cannot be imported (a link, a contact)', async () => {
    share({ sharedPayloads: [{ value: 'https://example.com', shareType: 'url' }], resolvedSharedPayloads: [{ value: 'https://example.com', shareType: 'url', contentType: 'website' } as never] });
    await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    expect(clear).toHaveBeenCalled();
    await renderWithRepo(<ImportScreen />, settings);
    expect((await screen.findByTestId('import-message')).props).toBeTruthy();
    expect(screen.getByText(/That can't be imported/)).toBeTruthy();
    expect(getSession().shareProblem).toBeNull();
  });

  it('show a plain message, never raw error text, when reading fails unexpectedly', async () => {
    (readImport as jest.Mock).mockRejectedValueOnce(new Error('java.io.FileNotFoundException: /proc/self/fd/88 (EACCES)'));
    const { setSession } = require('../session');
    setSession({ incoming: { kind: 'file', uri: 'content://x/9', name: 'x.pdf', mimeType: 'application/pdf' } });
    await renderWithRepo(<ImportScreen />, settings);
    expect(await screen.findByText(/This couldn't be read/)).toBeTruthy();
    expect(screen.queryByText(/java|EACCES/)).toBeNull();
  });

  it('are read for a Pro user: the SMS goes through the real parser and on to the review', async () => {
    share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
    await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(getSession().incoming).not.toBeNull());
    await renderWithRepo(<ImportScreen />, settings);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(readImport).toHaveBeenCalledWith({ kind: 'text', text: SMS }, expect.anything());
    expect(getSession().result?.rows).toMatchObject([{ description: 'CAREEM', amount: 4500, kind: 'cost' }]);
    expect(getSession().incoming).toBeNull();
  });

  it('clear a shared file and delete its copy once it has been read', async () => {
    const csv = new TextEncoder().encode('Date,Description,Amount\n03/11/2026,COFFEE,-12.50\n');
    (require('@/import/read/files').readBytes as jest.Mock).mockResolvedValue(csv);
    const { setSession } = require('../session');
    setSession({ incoming: { kind: 'file', uri: 'file:///c/s.csv', name: 's.csv', mimeType: 'text/csv' } });
    await renderWithRepo(<ImportScreen />, settings);
    await new Promise((r) => setTimeout(r, 100));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(clearSharedPayloads).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('file:///c/s.csv');
  });

  it('ask before replacing an import that is waiting for review', async () => {
    const { setResult } = require('../session');
    setResult({ result: { rows: [], source: 'csv', problems: [] }, sourceName: 'old.csv', fileKind: 'csv' });
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation((_t: any, _m: any, buttons: any) => buttons[0].onPress());
    require('../session').setSession({ incoming: { kind: 'text', text: SMS } });
    await renderWithRepo(<ImportScreen />, settings);
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Replace the current import?', expect.any(String), expect.any(Array), expect.anything()));
    expect(readImport).not.toHaveBeenCalled();
    expect(getSession().sourceName).toBe('old.csv');
    alert.mockImplementation((_t: any, _m: any, buttons: any) => buttons[1].onPress());
    require('../session').setSession({ incoming: { kind: 'text', text: SMS + ' ' } });
    await waitFor(() => expect(getSession().sourceName).toBe('Shared text'));
    expect(readImport).toHaveBeenCalledTimes(1);
  });

  it('show the Pro screen to a free user and are never read', async () => {
    mockPro = false;
    share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
    await renderWithRepo(<IncomingShareHandler />, settings);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    await renderWithRepo(<ImportScreen />, settings);
    expect(await screen.findByTestId('import-unlock')).toBeTruthy();
    expect(screen.getByTestId('import-pro-badge')).toBeTruthy();
    await waitFor(() => expect(getSession().incoming).toBeNull());
    expect(readImport).not.toHaveBeenCalled();
    expect(getSession().result).toBeNull();
  });
});
