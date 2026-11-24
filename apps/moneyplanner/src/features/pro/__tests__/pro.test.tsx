import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import ProScreen from '@/app/pro';
import { PRO_CACHE_KEY, ProProvider } from '@/lib/pro';
import { renderWithRepo } from '../../../../test-support/render';
import { ownsPro, PRO_PRODUCT_ID, storeErrorMessage, type BuyOutcome, type ProStore } from '@/lib/purchases';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-secure-store', () => {
  const m = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => m.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void m.delete(k)),
    __map: m,
  };
});
const cacheMap = (SecureStore as unknown as { __map: Map<string, string> }).__map;

/** A store we control: what it owns, its price, and a way to send purchase results. */
function fakeStore(over: Partial<ProStore> & { owns?: boolean } = {}) {
  let emit: (o: BuyOutcome, m?: string) => void = () => {};
  const s: ProStore & { emit: (o: BuyOutcome, m?: string) => Promise<void> } = {
    connect: jest.fn(async () => true),
    price: jest.fn(async () => 'AED 39.99'),
    owned: jest.fn(async () => !!over.owns),
    buy: jest.fn(async () => {}),
    restore: jest.fn(async () => !!over.owns),
    listen: jest.fn((cb) => {
      emit = cb;
      return () => {};
    }),
    disconnect: jest.fn(async () => {}),
    emit: async (o, m) => {
      await act(async () => emit(o, m));
    },
    ...over,
  };
  return s;
}
const show = (store: ProStore) =>
  renderWithRepo(
    <ProProvider store={store}>
      <ProScreen />
    </ProProvider>,
  );

beforeEach(() => cacheMap.clear());

describe('owning Pro', () => {
  it('only a paid Pro purchase counts (a pending one or another product does not)', () => {
    expect(ownsPro([{ productId: PRO_PRODUCT_ID, purchaseState: 'purchased' }])).toBe(true);
    expect(ownsPro([{ productId: PRO_PRODUCT_ID, purchaseState: 'pending' }])).toBe(false);
    expect(ownsPro([{ productId: 'other', purchaseState: 'purchased' }])).toBe(false);
    expect(storeErrorMessage('network-error')).toMatch(/connection/);
    expect(storeErrorMessage('something-new')).toMatch(/Nothing was charged/);
  });
});

describe('Pro screen', () => {
  it('shows what Pro adds and the store price; buying unlocks Pro and remembers it on the phone', async () => {
    const store = fakeStore();
    await show(store);
    expect(await screen.findByText('Unlock Pro for AED 39.99')).toBeTruthy();
    expect(screen.getByText('✓ Statement import')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pro-buy'));
    expect(store.buy).toHaveBeenCalled();
    await store.emit('purchased');
    expect(await screen.findByText('Pro is unlocked')).toBeTruthy();
    expect(screen.queryByTestId('pro-buy')).toBeNull();
    await waitFor(() => expect(cacheMap.get(PRO_CACHE_KEY)).toBe('1'));
  });

  it('a cancelled purchase says nothing; a failed one explains and stays free; a pending one waits', async () => {
    const store = fakeStore();
    await show(store);
    await screen.findByTestId('pro-buy');
    await store.emit('cancelled');
    expect(screen.queryByTestId('pro-message')).toBeNull();
    await store.emit('error', 'Could not reach the store. Check the connection and try again.');
    expect(screen.getByText(/Could not reach the store/)).toBeTruthy();
    await store.emit('pending');
    expect(screen.getByText(/pending/)).toBeTruthy();
    expect(screen.getByText('Money Planner Pro')).toBeTruthy();
  });

  it('restore unlocks Pro when the store account owns it, and says so when it does not', async () => {
    await show(fakeStore());
    await fireEvent.press(await screen.findByTestId('pro-restore'));
    expect(await screen.findByText(/No Pro purchase was found/)).toBeTruthy();
    cacheMap.clear();
  });

  it('opens unlocked when the store says Pro is owned (a reinstall)', async () => {
    await show(fakeStore({ owns: true }));
    expect(await screen.findByText('Pro is unlocked')).toBeTruthy();
    await waitFor(() => expect(cacheMap.get(PRO_CACHE_KEY)).toBe('1'));
  });

  it('locks again after a refund (the store answers that Pro is not owned)', async () => {
    cacheMap.set(PRO_CACHE_KEY, '1');
    await show(fakeStore({ owns: false }));
    await waitFor(() => expect(screen.getByText('Money Planner Pro')).toBeTruthy());
    await waitFor(() => expect(cacheMap.has(PRO_CACHE_KEY)).toBe(false));
  });

  it('offline: the remembered unlock is kept when the store does not answer', async () => {
    cacheMap.set(PRO_CACHE_KEY, '1');
    await show(fakeStore({ owned: jest.fn(async () => Promise.reject(new Error('offline'))) }));
    expect(await screen.findByText('Pro is unlocked')).toBeTruthy();
  });

  it('without a store (web, not from a store) there is no dead buy button', async () => {
    await show(fakeStore({ connect: jest.fn(async () => false) }));
    expect(await screen.findByTestId('pro-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('pro-buy')).toBeNull();
  });
});
