// Pro unlock (one-time purchase). Owned by the lead. Milestone 4 replaces this
// stub with the real store purchase (src/lib/purchases.ts) and restore.
// Until then nobody is Pro, except test builds made with EXPO_PUBLIC_PRO_PREVIEW=1
// so Pro screens (reports) can be tried on a phone.

export function isProPreviewBuild(): boolean {
  return process.env.EXPO_PUBLIC_PRO_PREVIEW === '1';
}

/** Whether Pro features are unlocked for this phone. */
export function usePro(): { isPro: boolean; loading: boolean } {
  return { isPro: isProPreviewBuild(), loading: false };
}
