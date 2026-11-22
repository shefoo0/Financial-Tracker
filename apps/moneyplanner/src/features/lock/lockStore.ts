// PIN storage for the per-profile lock. The PIN itself is never stored: a
// salted SHA-256 hash goes to the phone's secure storage under a key that
// contains the profile id. On the web preview (no secure storage) and in tests
// without a mock, a memory map is used instead.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const PIN_MIN = 4;
export const PIN_MAX = 6;

interface Backend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

const memory = new Map<string, string>();
const memoryBackend: Backend = {
  get: async (k) => memory.get(k) ?? null,
  set: async (k, v) => void memory.set(k, v),
  del: async (k) => void memory.delete(k),
};
const secureBackend: Backend = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  del: (k) => SecureStore.deleteItemAsync(k),
};
const backend = (): Backend => (Platform.OS === 'web' ? memoryBackend : secureBackend);

/** Secure store keys allow letters, digits, '.', '-' and '_'. */
const safe = (profileId: string) => profileId.replace(/[^A-Za-z0-9._-]/g, '_');
const pinKey = (profileId: string) => `moneyplanner.pin.${safe(profileId)}`;
const bioKey = (profileId: string) => `moneyplanner.bio.${safe(profileId)}`;

interface StoredPin {
  salt: string;
  hash: string;
  /** Length of the PIN, so the lock screen can unlock as soon as the last digit is typed. */
  len: number;
}

async function hashPin(salt: string, profileId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${profileId}:${pin}`);
}

function randomSalt(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function read(profileId: string): Promise<StoredPin | null> {
  const raw = await backend().get(pinKey(profileId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StoredPin;
    return typeof v.salt === 'string' && typeof v.hash === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);

export const lockStore = {
  /** Saves a new PIN (4-6 digits) for the profile, replacing any old one. */
  async setPin(profileId: string, pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error(`The PIN must be ${PIN_MIN} to ${PIN_MAX} digits.`);
    const salt = randomSalt();
    const stored: StoredPin = { salt, hash: await hashPin(salt, profileId, pin), len: pin.length };
    await backend().set(pinKey(profileId), JSON.stringify(stored));
  },
  async verifyPin(profileId: string, pin: string): Promise<boolean> {
    const stored = await read(profileId);
    if (!stored) return false;
    return (await hashPin(stored.salt, profileId, pin)) === stored.hash;
  },
  async hasPin(profileId: string): Promise<boolean> {
    return (await read(profileId)) !== null;
  },
  /** The length of the saved PIN, or null when there is none. */
  async pinLength(profileId: string): Promise<number | null> {
    return (await read(profileId))?.len ?? null;
  },
  async clearPin(profileId: string): Promise<void> {
    await backend().del(pinKey(profileId));
    await backend().del(bioKey(profileId));
  },
  /** Whether Face ID / fingerprint may be offered for this profile (default yes). */
  async getBiometricPref(profileId: string): Promise<boolean> {
    return (await backend().get(bioKey(profileId))) !== '0';
  },
  async setBiometricPref(profileId: string, on: boolean): Promise<void> {
    await backend().set(bioKey(profileId), on ? '1' : '0');
  },
  /** Tests only. */
  _resetMemory() {
    memory.clear();
  },
};
