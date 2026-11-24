// Pro unlock (milestone 4): a one-time purchase from the phone's store (src/lib/store.ts), remembered on the phone so
// Pro works offline, checked with the store at start (a refund takes it away), and restorable after a reinstall.
// Test builds made with EXPO_PUBLIC_PRO_PREVIEW=1 are always Pro, so Pro screens can be tried before a purchase exists.
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { BuyOutcome, ProStore } from './purchases';
import { store as phoneStore } from './store';

export function isProPreviewBuild(): boolean {
  return process.env.EXPO_PUBLIC_PRO_PREVIEW === '1';
}

/** Where the unlock is remembered (per phone, for every profile). */
export const PRO_CACHE_KEY = 'moneyplanner.pro.v1';
const cache = {
  get: async () => (Platform.OS === 'web' ? null : SecureStore.getItemAsync(PRO_CACHE_KEY).catch(() => null)),
  set: async (on: boolean) => {
    if (Platform.OS === 'web') return;
    await (on ? SecureStore.setItemAsync(PRO_CACHE_KEY, '1') : SecureStore.deleteItemAsync(PRO_CACHE_KEY)).catch(() => {});
  },
};

export interface ProState {
  /** Whether Pro features are unlocked for this phone. */
  isPro: boolean;
  /** True until the remembered unlock has been read. */
  loading: boolean;
  /** Whether the store can be reached for a purchase (false on the web build or without a store). */
  available: boolean;
  /** The price as the store shows it, once known. */
  price: string | null;
  /** A purchase or restore is under way. */
  busy: boolean;
  /** The last purchase or restore result in words, for the Pro screen; null when there's nothing to say. */
  message: string | null;
  buy(): Promise<void>;
  restore(): Promise<boolean>;
}

const noStore: ProState = {
  isPro: false,
  loading: false,
  available: false,
  price: null,
  busy: false,
  message: null,
  buy: async () => {},
  restore: async () => false,
};

const ProContext = createContext<ProState | null>(null);

export function ProProvider({ children, store = phoneStore }: { children: ReactNode; store?: ProStore }) {
  const preview = isProPreviewBuild();
  const [isPro, setPro] = useState(preview);
  const [loading, setLoading] = useState(!preview);
  const [available, setAvailable] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);

  const unlock = useCallback((on: boolean) => {
    if (!alive.current) return;
    setPro(on);
    void cache.set(on);
  }, []);

  useEffect(() => {
    alive.current = true;
    if (preview) return;
    let stop = () => {};
    (async () => {
      if ((await cache.get()) === '1' && alive.current) setPro(true);
      if (alive.current) setLoading(false);
      if (!(await store.connect()) || !alive.current) return;
      setAvailable(true);
      stop = store.listen((outcome: BuyOutcome, text?: string) => {
        if (!alive.current) return;
        setBusy(false);
        if (outcome === 'purchased') {
          unlock(true);
          setMessage('Pro is unlocked. Thank you!');
        } else if (outcome === 'pending') setMessage('The payment is pending. Pro unlocks when the store confirms it.');
        else if (outcome === 'error') setMessage(text ?? 'The purchase did not go through. Please try again.');
        else setMessage(null);
      });
      store.price().then((p) => alive.current && setPrice(p), () => {});
      // The store is the truth when it answers: a refunded purchase locks Pro again; no answer keeps what we remembered.
      store.owned().then(unlock, () => {});
    })();
    return () => {
      alive.current = false;
      stop();
      void store.disconnect();
    };
  }, [preview, store, unlock]);

  const buy = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      await store.buy();
    } catch {
      setBusy(false);
      setMessage('The store could not start the purchase. Nothing was charged. Please try again.');
    }
  }, [store]);

  const restore = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      const owned = await store.restore();
      if (owned) unlock(true);
      setMessage(owned ? 'Pro is restored. Thank you!' : 'No Pro purchase was found for this store account.');
      return owned;
    } catch {
      setMessage('Could not reach the store. Check the connection and try again.');
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [store, unlock]);

  const value = useMemo<ProState>(
    () => ({ isPro, loading, available: available && !preview, price, busy, message, buy, restore }),
    [isPro, loading, available, preview, price, busy, message, buy, restore],
  );
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

/** Pro state; outside a ProProvider (tests, previews) only a preview build is Pro. */
export function usePro(): ProState {
  return useContext(ProContext) ?? { ...noStore, isPro: isProPreviewBuild() };
}
