// Wrong-PIN throttle: 5 wrong tries, then a wait that grows each time
// (30 s, 1 min, 5 min, 15 min...). Kept in memory and saved in secure storage
// per profile, so restarting the app doesn't reset it.
import { lockStore } from './lockStore';

export const MAX_TRIES = 5;
export const WAITS_MS = [30_000, 60_000, 300_000, 900_000];
export const WAIT_MS = WAITS_MS[0];

interface State {
  fails: number;
  lockouts: number;
  until: number;
}
const states = new Map<string, State>();

const persist = (id: string) => {
  const s = states.get(id);
  (s ? lockStore.setThrottle(id, JSON.stringify(s)) : lockStore.clearThrottle(id)).catch(() => undefined);
};

export const throttle = {
  /** Loads the saved state into memory (call once when the lock screen appears). */
  async hydrate(profileId: string): Promise<void> {
    if (states.has(profileId)) return;
    try {
      const raw = await lockStore.getThrottle(profileId);
      const v = raw ? (JSON.parse(raw) as State) : null;
      if (v && Number.isFinite(v.fails) && Number.isFinite(v.lockouts) && Number.isFinite(v.until)) states.set(profileId, v);
    } catch {
      // unreadable: start fresh
    }
  },
  /** Milliseconds left to wait, or 0. */
  remaining(profileId: string, now = Date.now()): number {
    const s = states.get(profileId);
    return s && s.until > now ? s.until - now : 0;
  },
  /** Records a wrong PIN. Returns the wait that started (ms), or 0. */
  fail(profileId: string, now = Date.now()): number {
    const s = states.get(profileId) ?? { fails: 0, lockouts: 0, until: 0 };
    let wait = 0;
    s.fails += 1;
    if (s.fails >= MAX_TRIES) {
      wait = WAITS_MS[Math.min(s.lockouts, WAITS_MS.length - 1)];
      s.fails = 0;
      s.lockouts += 1;
      s.until = now + wait;
    }
    states.set(profileId, s);
    persist(profileId);
    return wait;
  },
  triesLeft(profileId: string): number {
    return MAX_TRIES - (states.get(profileId)?.fails ?? 0);
  },
  reset(profileId: string) {
    states.delete(profileId);
    persist(profileId);
  },
  _resetAll() {
    states.clear();
  },
};

/** "30 seconds", "2 minutes". */
export function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
  const m = Math.ceil(s / 60);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}
