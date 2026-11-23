// Small type guards shared by the settings schema and the backup reader.
import { isValidISODate } from '@/lib/dates';

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isId = (v: unknown): v is string => isStr(v) && v.length > 0;
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
/** A money value in fils: a safe integer. */
export const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
export const isAmount = (v: unknown): v is number => isMoney(v) && v >= 0;
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
export const isDate = (v: unknown): v is string => isStr(v) && isValidISODate(v);
export const nullOr = (v: unknown, check: (x: unknown) => boolean) => v === null || check(v);
export const inRange = (v: unknown, min: number, max: number) => isInt(v) && v >= min && v <= max;
