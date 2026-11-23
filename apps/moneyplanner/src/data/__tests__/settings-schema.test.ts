import * as DocumentPicker from 'expo-document-picker';
import { parseBackup, serializeBackup } from '@/data/backup';
import { createMemoryRepository } from '@/data/memory/memory-repository';
import { SETTING_SAMPLES } from '@/data/memory/repository-contract';
import { defaultSettings, keepDeviceLocal, readBackupSettings, SETTING_KEYS, settingsFromStored, SETTINGS_SCHEMA } from '@/data/settingsSchema';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));

void DocumentPicker;

describe('settings schema', () => {
  it('has a default that passes its own validator, for every key', () => {
    const d = defaultSettings();
    for (const k of SETTING_KEYS) expect(SETTINGS_SCHEMA[k].validate(d[k])).toEqual(d[k]);
    expect(settingsFromStored({})).toEqual(d);
  });

  it('round-trips every key through a backup file; the device-local lock stays off', async () => {
    const repo = createMemoryRepository();
    await repo.init();
    await repo.updateSettings(SETTING_SAMPLES);
    const parsed = parseBackup(serializeBackup(await repo.exportAll()));
    const expected = { ...SETTING_SAMPLES, lockEnabled: false };
    expect(parsed.settings).toEqual(expected);
    for (const k of SETTING_KEYS) if (!SETTINGS_SCHEMA[k].deviceLocal) expect(parsed.settings[k]).toEqual(SETTING_SAMPLES[k]);
  });

  it('importAll keeps every device-local key of this phone', async () => {
    const repo = createMemoryRepository();
    await repo.init();
    await repo.updateSettings({ lockEnabled: true });
    const other = createMemoryRepository();
    await other.init();
    await other.updateSettings(SETTING_SAMPLES);
    await repo.importAll(parseBackup(serializeBackup(await other.exportAll())));
    expect(await repo.getSettings()).toEqual({ ...SETTING_SAMPLES, lockEnabled: true });
    expect(keepDeviceLocal(defaultSettings(), { ...defaultSettings(), lockEnabled: true }).lockEnabled).toBe(true);
  });

  it('rejects a backup whose required key is invalid, and defaults the others', () => {
    const bad = { ...SETTING_SAMPLES, buffer: 'lots' };
    expect(readBackupSettings(bad)).toBeNull();
    expect(readBackupSettings({ ...SETTING_SAMPLES, chartStyle: 'violet', notificationsOn: 'yes' })).toMatchObject({ chartStyle: 'plain', notificationsOn: true });
    expect(readBackupSettings(null)).toBeNull();
  });

  it('migrates the old enabledModules.alerts flag when reading stored values', () => {
    expect(settingsFromStored({ enabledModules: { debts: true, alerts: false } }).notificationsOn).toBe(false);
    expect(settingsFromStored({ enabledModules: { alerts: false }, notificationsOn: true }).notificationsOn).toBe(true);
  });
});
