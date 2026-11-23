// The one description of every setting: its default and how a stored or imported value is checked.
// Everything else derives from it: defaultSettings(), the repositories' stored-settings merge (SQLite and memory),
// the backup reader and the "this phone keeps its own value" rule of importAll. A new setting is one entry here
// (plus the field in the Settings type); the contract test in __tests__/settings-schema.test.ts proves it round-trips.
import { chartStyleOf } from '@/constants/theme';
import { defaultHomeLayout, validateHomeLayout } from '@/features/home/layout';
import { today } from '@/lib/dates';
import type { AlertThresholds, BillReminders, ChartRange, Settings } from '@/types';
import { inRange, isBool, isDate, isInt, isMoney, isObj, isStr, nullOr, type Obj } from './guards';

export interface SettingDescriptor<T> {
  /** The value of a fresh profile. */
  default: (now: Date) => T;
  /**
   * The value if `v` is acceptable, otherwise undefined. Nested objects return a full object: every valid field is
   * taken from `v` and the others come from the defaults (this is the merge for nested settings).
   */
  validate: (v: unknown) => T | undefined;
  /** A backup without a valid value is rejected as damaged (instead of getting the default). */
  required?: boolean;
  /** Belongs to this phone: a backup (or restore) never changes it. */
  deviceLocal?: boolean;
}

export const CHART_RANGES: readonly ChartRange[] = ['1M', '2M', '6M', '1Y'];
export const DEFAULT_BUFFER = 100000;

/** Fills `defaults` with each valid field of `v` (a field is valid when its check passes). */
function fill<T extends object>(defaults: T, v: unknown, checks: { [K in keyof T]: (x: unknown) => boolean }): T | undefined {
  if (!isObj(v)) return undefined;
  const out = { ...defaults } as Obj;
  for (const k of Object.keys(checks) as (keyof T & string)[]) if (checks[k](v[k])) out[k] = v[k];
  return out as T;
}

const thresholdDefaults: AlertThresholds = { debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 };

export const SETTINGS_SCHEMA: { [K in keyof Settings]-?: SettingDescriptor<Settings[K]> } = {
  currency: { default: () => 'AED', validate: (v) => (isStr(v) ? v : undefined), required: true },
  payday: { default: () => null, validate: (v) => (nullOr(v, (p) => inRange(p, 1, 31)) ? (v as number | null) : undefined), required: true },
  startingBalance: { default: () => 0, validate: (v) => (isMoney(v) ? v : undefined), required: true },
  startingBalanceDate: { default: (now) => today(now), validate: (v) => (isDate(v) ? v : undefined), required: true },
  buffer: { default: () => DEFAULT_BUFFER, validate: (v) => (isMoney(v) ? v : undefined), required: true },
  notificationsOn: { default: () => true, validate: (v) => (isBool(v) ? v : undefined) },
  alertThresholds: {
    default: () => ({ ...thresholdDefaults }),
    validate: (v) => fill(thresholdDefaults, v, { debtCautionPct: isInt, debtHighPct: isInt, cardUsagePct: isInt }),
    required: true,
  },
  billReminders: {
    default: () => ({ on: true, leadDays: 1, muted: [] }),
    validate: (v) =>
      fill<BillReminders>({ on: true, leadDays: 1, muted: [] }, v, {
        on: isBool,
        leadDays: (x) => inRange(x, 0, 3),
        muted: (x) => Array.isArray(x) && x.every(isStr),
      }),
  },
  onboarded: { default: () => false, validate: (v) => (isBool(v) ? v : undefined), required: true },
  lockEnabled: { default: () => false, validate: (v) => (isBool(v) ? v : undefined), required: true, deviceLocal: true },
  chartStyle: { default: () => 'plain', validate: (v) => chartStyleOf(v) },
  chartRange: { default: () => '2M', validate: (v) => (CHART_RANGES.includes(v as ChartRange) ? (v as ChartRange) : undefined) },
  homeLayout: { default: () => defaultHomeLayout(), validate: validateHomeLayout },
  tipsSeen: { default: () => [], validate: (v) => (Array.isArray(v) && v.every(isStr) ? [...new Set(v)] : undefined) },
  homeVisits: { default: () => 0, validate: (v) => (inRange(v, 0, 1_000_000) ? (v as number) : undefined) },
  mainAccountName: { default: () => 'Main account', validate: (v) => (isStr(v) && v.trim().length >= 1 && v.length <= 40 ? v : undefined) },
  defaultAccountId: { default: () => null, validate: (v) => (nullOr(v, isStr) ? (v as string | null) : undefined) },
  spendingPeriod: { default: () => 'month', validate: (v) => (v === 'month' || v === 'year' ? v : undefined) },
};

type Key = keyof Settings;
const KEYS = Object.keys(SETTINGS_SCHEMA) as Key[];
const desc = <K extends Key>(k: K) => SETTINGS_SCHEMA[k] as SettingDescriptor<Settings[K]>;
/** `value`, or `fallback` when it is undefined (null is a real value, e.g. no payday). */
const orElse = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);

/** The keys that belong to this phone (the lock). */
export const DEVICE_LOCAL_KEYS = KEYS.filter((k) => SETTINGS_SCHEMA[k].deviceLocal);
export const SETTING_KEYS: readonly Key[] = KEYS;

export function defaultSettings(now: Date = new Date()): Settings {
  const out: Obj = {};
  for (const k of KEYS) out[k] = SETTINGS_SCHEMA[k].default(now);
  return out as unknown as Settings;
}

/** Older data stored the "phone notifications on" flag as enabledModules.alerts. */
function migrate(raw: Obj): Obj {
  const em = raw.enabledModules;
  if (raw.notificationsOn === undefined && isObj(em) && isBool(em.alerts)) return { ...raw, notificationsOn: em.alerts };
  return raw;
}

/** Settings from stored values (SQLite rows, a partial backup): each key checked, missing or invalid ones get the default. */
export function settingsFromStored(stored: unknown, now: Date = new Date()): Settings {
  const raw = migrate(isObj(stored) ? stored : {});
  const out: Obj = {};
  for (const k of KEYS) out[k] = orElse(desc(k).validate(raw[k]), desc(k).default(now));
  return out as unknown as Settings;
}

/** `base` with the keys of `patch` applied (checked like stored values; an invalid one keeps the base value). */
export function applySettingsPatch(base: Settings, patch: Partial<Settings>): Settings {
  const out: Obj = { ...base };
  for (const k of KEYS) {
    if (patch[k] === undefined) continue;
    out[k] = orElse(desc(k).validate(patch[k]), base[k]);
  }
  return out as unknown as Settings;
}

/** Settings from a backup file: null when a required key is missing or invalid; device-local keys get the default. */
export function readBackupSettings(v: unknown): Settings | null {
  if (!isObj(v)) return null;
  const raw = migrate(v);
  const now = new Date();
  const out: Obj = {};
  for (const k of KEYS) {
    const d = desc(k);
    const value = d.validate(raw[k]);
    if (value === undefined && d.required) return null;
    out[k] = d.deviceLocal ? d.default(now) : orElse(value, d.default(now));
  }
  return out as unknown as Settings;
}

/** `incoming` settings with this phone's own values for the device-local keys. */
export function keepDeviceLocal(incoming: Settings, current: Settings): Settings {
  const out: Obj = { ...incoming };
  for (const k of DEVICE_LOCAL_KEYS) out[k] = current[k];
  return out as unknown as Settings;
}
