// The phone's store for the Pro purchase: Google Play Billing on Android, StoreKit on iPhone, through expo-iap
// (free, open source, MIT). Purchases go straight between the phone and the store: no server, no API key.
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap';

import { ownsPro, PRO_PRODUCT_ID, storeErrorMessage, type ProStore } from './purchases';

const isPro = (p: Purchase) => p.productId === PRO_PRODUCT_ID;

/** Finishes (acknowledges) a paid Pro purchase; Google refunds one that is not acknowledged within 3 days. */
async function finish(p: Purchase) {
  if (!isPro(p) || p.purchaseState !== 'purchased') return;
  if ((p as { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid) return;
  await finishTransaction({ purchase: p, isConsumable: false });
}

async function ownedNow(): Promise<boolean> {
  const purchases = await getAvailablePurchases();
  for (const p of purchases) await finish(p).catch(() => {});
  return ownsPro(purchases);
}

export const store: ProStore = {
  async connect() {
    try {
      return !!(await initConnection());
    } catch {
      return false;
    }
  },
  async price() {
    const products = await fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' });
    const pro = (products ?? []).find((p) => p.id === PRO_PRODUCT_ID);
    return pro?.displayPrice ?? null;
  },
  owned: ownedNow,
  async buy() {
    await requestPurchase({ request: { apple: { sku: PRO_PRODUCT_ID }, google: { skus: [PRO_PRODUCT_ID] } }, type: 'in-app' });
  },
  async restore() {
    await restorePurchases().catch(() => {});
    return ownedNow();
  },
  listen(onResult) {
    const ok = purchaseUpdatedListener((p) => {
      if (!isPro(p)) return;
      if (p.purchaseState === 'purchased') finish(p).then(() => onResult('purchased'), () => onResult('purchased'));
      else if (p.purchaseState === 'pending') onResult('pending');
    });
    const bad = purchaseErrorListener((e) => {
      if (e.code === 'user-cancelled') onResult('cancelled');
      else if (e.code === 'already-owned') onResult('purchased');
      else onResult('error', storeErrorMessage(e.code));
    });
    return () => {
      ok.remove();
      bad.remove();
    };
  },
  async disconnect() {
    await endConnection().catch(() => {});
  },
};
