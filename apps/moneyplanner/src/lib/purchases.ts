// Pro one-time purchase (milestone 4): the product, what counts as owning it, and the shape of the store the app uses.
// The store itself is `store.ts` (Google Play Billing / StoreKit through the free, open-source expo-iap; no server, no
// account, no API key) and `store.web.ts` (no store on the web build).

/** The one Pro product: a non-consumable "managed product" in Play Console and a non-consumable in App Store Connect. */
export const PRO_PRODUCT_ID = 'com.shefoo.moneyplanner.pro';

/** A purchase as the store reports it (only what the app reads). */
export interface StorePurchase {
  productId: string;
  purchaseState: 'pending' | 'purchased' | 'unknown';
}

/** Whether these purchases include Pro, paid for (a pending payment, e.g. cash at a shop, does not unlock yet). */
export const ownsPro = (purchases: readonly StorePurchase[]): boolean =>
  purchases.some((p) => p.productId === PRO_PRODUCT_ID && p.purchaseState === 'purchased');

/** What a purchase attempt ended with, for the Pro screen. */
export type BuyOutcome = 'purchased' | 'pending' | 'cancelled' | 'error';

export interface ProStore {
  /** False when there is no store (web, a simulator without one, a build not from the store). */
  connect(): Promise<boolean>;
  /** The price as the store shows it ("AED 39.99"), or null when the product can't be found. */
  price(): Promise<string | null>;
  /** Whether this store account owns Pro (also finishes a paid purchase that wasn't finished yet). */
  owned(): Promise<boolean>;
  /** Starts the store's purchase sheet; the result comes to `listen`. */
  buy(): Promise<void>;
  /** Asks the store again (after reinstalling or on a new phone); true when Pro is owned. */
  restore(): Promise<boolean>;
  /** Purchase results; returns a function that stops listening. */
  listen(onResult: (outcome: BuyOutcome, message?: string) => void): () => void;
  disconnect(): Promise<void>;
}

/** Friendly words for a store error code. */
export function storeErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'network-error':
      return 'Could not reach the store. Check the connection and try again.';
    case 'billing-unavailable':
    case 'iap-not-available':
      return 'The store is not available on this phone right now.';
    case 'item-unavailable':
    case 'sku-not-found':
      return 'Pro is not on sale in this store yet.';
    case 'already-owned':
      return 'This store account already owns Pro. Tap "Restore purchase".';
    default:
      return 'The purchase did not go through. Nothing was charged. Please try again.';
  }
}
