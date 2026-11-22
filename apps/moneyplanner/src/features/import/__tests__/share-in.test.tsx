import { useIncomingShare } from 'expo-sharing';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { readImport } from '@/import/read';
import { defaultSettings } from '@/data/defaults';

import { resetRouterMock, router } from '../../../../test-support/expo-router-mock';
import { renderWithRepo } from '../../../../test-support/render';
import { IncomingShareHandler, shareToInput } from '../IncomingShareHandler';
import ImportScreen from '../ImportScreen';
import { getSession, resetSession } from '../session';

jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...require('../../../../test-support/expo-router-mock'),
  useRootNavigationState: () => ({ key: 'root' }),
}));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-sharing', () => ({ useIncomingShare: jest.fn() }));
let mockPro = true;
jest.mock('@/lib/pro', () => ({ usePro: () => ({ isPro: mockPro, loading: false }), isProPreviewBuild: () => mockPro }));
jest.mock('@/import/ocr/native', () => ({ ocrNative: {} }));
jest.mock('@/import/pdf/native', () => ({ pdfNative: {} }));
jest.mock('@/import/read', () => {
  const actual = jest.requireActual('@/import/read');
  return { ...actual, readImport: jest.fn(actual.readImport) };
});
jest.mock('@/import/read/files', () => ({ readBytes: jest.fn() }));

const SMS = 'Purchase of AED 45.00 at CAREEM on 21-11-2026 12:30 using card ending 1234. Avl Bal AED 2,345.10.';
const settings = { ...defaultSettings(), onboarded: true };
const clear = jest.fn();
const share = (over: Partial<ReturnType<typeof useIncomingShare>>) =>
  (useIncomingShare as jest.Mock).mockReturnValue({
    sharedPayloads: [], resolvedSharedPayloads: [], isResolving: false, error: null, clearSharedPayloads: clear, refreshSharePayloads: jest.fn(), ...over,
  });

beforeEach(() => {
  resetRouterMock();
  resetSession();
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
    await render(<IncomingShareHandler />);
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
    await render(<IncomingShareHandler />);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    expect(getSession().incoming).toEqual({ kind: 'file', uri: 'file:///c/s.csv', name: 's.csv', mimeType: 'text/csv' });
    expect(clear).not.toHaveBeenCalled();
  });

  it('wait while a file is still being resolved, and do nothing when nothing was shared', async () => {
    share({ sharedPayloads: [{ value: 'file:///c/s.csv', shareType: 'file' }], isResolving: true });
    await render(<IncomingShareHandler />);
    share({});
    await render(<IncomingShareHandler />);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('do nothing on the web, where sharing in does not exist', async () => {
    const os = Platform.OS;
    Platform.OS = 'web';
    try {
      share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
      await render(<IncomingShareHandler />);
      expect(router.navigate).not.toHaveBeenCalled();
    } finally {
      Platform.OS = os;
    }
  });

  it('are read for a Pro user: the SMS goes through the real parser and on to the review', async () => {
    share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
    await render(<IncomingShareHandler />);
    await waitFor(() => expect(getSession().incoming).not.toBeNull());
    await renderWithRepo(<ImportScreen />, { settings });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import/review'));
    expect(readImport).toHaveBeenCalledWith({ kind: 'text', text: SMS }, expect.anything());
    expect(getSession().result?.rows).toMatchObject([{ description: 'CAREEM', amount: 4500, kind: 'cost' }]);
    expect(getSession().incoming).toBeNull();
  });

  it('show the Pro screen to a free user and are never read', async () => {
    mockPro = false;
    share({ sharedPayloads: [{ value: SMS, shareType: 'text' }] });
    await render(<IncomingShareHandler />);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/import'));
    await renderWithRepo(<ImportScreen />, { settings });
    expect(await screen.findByTestId('import-unlock')).toBeTruthy();
    expect(screen.getByTestId('import-pro-badge')).toBeTruthy();
    await waitFor(() => expect(getSession().incoming).toBeNull());
    expect(readImport).not.toHaveBeenCalled();
    expect(getSession().result).toBeNull();
  });
});
