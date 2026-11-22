// Behaviour shared by both profile stores (validation, rules, write queue), so the
// SQLite and in-memory stores cannot drift apart. A backend only loads and saves.
import { newId } from '@/lib/id';
import {
  MAX_PROFILES,
  PROFILE_NAME_MAX,
  type Appearance,
  type DeviceState,
  type Profile,
  type ProfileStore,
} from '@/data/profiles/types';

export const FIRST_DB_NAME = 'moneyplanner.db';
const APPEARANCES: Appearance[] = ['system', 'light', 'dark'];

export interface ProfileBackend {
  /** The saved state, or null on the very first run. */
  load(): Promise<DeviceState | null>;
  /** Saves the whole state. */
  save(state: DeviceState): Promise<void>;
  /** Deletes the profile's data (a missing file is not an error). */
  removeData(profile: Profile): Promise<void>;
}

const copy = (s: DeviceState): DeviceState => ({ ...s, profiles: s.profiles.map((p) => ({ ...p })) });

function cleanName(name: string): string {
  const n = typeof name === 'string' ? name.trim() : '';
  if (n.length < 1) throw new Error('Enter a name.');
  if (n.length > PROFILE_NAME_MAX) throw new Error(`Use at most ${PROFILE_NAME_MAX} characters.`);
  return n;
}

function checkColor(color: number): number {
  if (!Number.isInteger(color) || color < 0) throw new Error('Pick a valid colour.');
  return color;
}

export function createProfileStoreCore(
  backend: ProfileBackend,
  openRepository: ProfileStore['openRepository'],
): ProfileStore {
  let state: DeviceState | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  // One operation at a time; a failure rejects for its caller only.
  function run<T>(task: () => Promise<T>): Promise<T> {
    const p = queue.then(task);
    queue = p.catch(() => undefined);
    return p;
  }

  async function load(): Promise<DeviceState> {
    if (state) return state;
    const saved = await backend.load();
    let next: DeviceState;
    if (!saved || saved.profiles.length === 0) {
      const me: Profile = {
        id: newId(),
        name: 'Me',
        color: 0,
        createdAt: new Date().toISOString(),
        dbName: FIRST_DB_NAME,
      };
      next = { profiles: [me], activeProfileId: me.id, appearance: 'system' };
      await backend.save(next);
    } else {
      next = copy(saved);
      if (!APPEARANCES.includes(next.appearance)) next.appearance = 'system';
      if (!next.profiles.some((p) => p.id === next.activeProfileId)) {
        next.activeProfileId = next.profiles[0].id;
        await backend.save(next);
      }
    }
    state = next;
    return state;
  }

  async function commit(next: DeviceState) {
    await backend.save(next);
    state = next;
  }

  const need = (s: DeviceState, id: string) => {
    const i = s.profiles.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('That profile does not exist.');
    return i;
  };

  return {
    init: () => run(async () => copy(await load())),

    addProfile: (name, color) =>
      run(async () => {
        const s = await load();
        const n = cleanName(name);
        checkColor(color);
        if (s.profiles.length >= MAX_PROFILES) throw new Error(`You can have at most ${MAX_PROFILES} profiles.`);
        let id = newId();
        while (s.profiles.some((p) => p.id === id)) id = newId();
        const profile: Profile = {
          id,
          name: n,
          color,
          createdAt: new Date().toISOString(),
          dbName: `moneyplanner-${id}.db`,
        };
        await commit({ ...s, profiles: [...s.profiles, profile] });
        return { ...profile };
      }),

    updateProfile: (id, patch) =>
      run(async () => {
        const s = await load();
        const i = need(s, id);
        const name = patch.name === undefined ? s.profiles[i].name : cleanName(patch.name);
        const color = patch.color === undefined ? s.profiles[i].color : checkColor(patch.color);
        const updated = { ...s.profiles[i], name, color };
        const profiles = s.profiles.slice();
        profiles[i] = updated;
        await commit({ ...s, profiles });
        return { ...updated };
      }),

    deleteProfile: (id) =>
      run(async () => {
        const s = await load();
        const i = need(s, id);
        const profile = s.profiles[i];
        await backend.removeData(profile);
        let profiles = s.profiles.filter((p) => p.id !== id);
        let activeProfileId = s.activeProfileId;
        if (profiles.length === 0) {
          // The last profile: start over with a fresh "Me" in a new file.
          const fresh = newId();
          profiles = [{ id: fresh, name: 'Me', color: 0, createdAt: new Date().toISOString(), dbName: `moneyplanner-${fresh}.db` }];
          activeProfileId = fresh;
        } else if (activeProfileId === id) {
          activeProfileId = profiles[0].id;
        }
        await commit({ ...s, profiles, activeProfileId });
      }),

    setActiveProfile: (id) =>
      run(async () => {
        const s = await load();
        need(s, id);
        await commit({ ...s, activeProfileId: id });
      }),

    setAppearance: (appearance) =>
      run(async () => {
        const s = await load();
        if (!APPEARANCES.includes(appearance)) throw new Error('Unknown appearance.');
        await commit({ ...s, appearance });
      }),

    openRepository,
  };
}
