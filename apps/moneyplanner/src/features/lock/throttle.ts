// Wrong-PIN throttle: 5 wrong tries, then a 30 second wait. Kept in memory per
// profile, so leaving and re-opening the lock screen doesn't reset it.
export const MAX_TRIES = 5;
export const WAIT_MS = 30_000;

interface State {
  fails: number;
  until: number;
}
const states = new Map<string, State>();

export const throttle = {
  /** Milliseconds left to wait, or 0. */
  remaining(profileId: string, now = Date.now()): number {
    const s = states.get(profileId);
    return s && s.until > now ? s.until - now : 0;
  },
  /** Records a wrong PIN. Returns the wait that started (ms), or 0. */
  fail(profileId: string, now = Date.now()): number {
    const s = states.get(profileId) ?? { fails: 0, until: 0 };
    s.fails += 1;
    if (s.fails >= MAX_TRIES) {
      s.fails = 0;
      s.until = now + WAIT_MS;
    }
    states.set(profileId, s);
    return s.until > now ? WAIT_MS : 0;
  },
  triesLeft(profileId: string): number {
    return MAX_TRIES - (states.get(profileId)?.fails ?? 0);
  },
  reset(profileId: string) {
    states.delete(profileId);
  },
  _resetAll() {
    states.clear();
  },
};
