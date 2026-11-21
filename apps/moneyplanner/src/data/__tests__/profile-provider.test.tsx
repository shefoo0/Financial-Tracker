import { act, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { usePlanInput } from '@/data/DataProvider';
import { useProfiles } from '@/data/profiles/ProfileProvider';
import { MAX_PROFILES } from '@/data/profiles/types';

import { renderWithRepo, transaction } from '../../../test-support/render';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => require('../../../test-support/expo-router-mock'));
jest.mock('@/global.css', () => ({}));

const mounts = jest.fn();
type Api = ReturnType<typeof useProfiles>;
let api: Api;
let lastError: string | null = null;

function Harness() {
  const p = useProfiles();
  const { data } = usePlanInput();
  useEffect(() => {
    api = p;
  });
  useEffect(() => {
    mounts(p.active.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Text testID="state">
      {`${p.active.name}|onboarded=${data?.settings.onboarded}|tx=${data?.transactions.map((t) => t.description).join(',')}|buffer=${data?.settings.buffer}`}
    </Text>
  );
}

const state = () => screen.getByTestId('state').props.children as string;
const seed = {
  settings: { onboarded: true, buffer: 777700, currency: 'AED', startingBalance: 0 } as never,
  transactions: [transaction({ id: 't1', description: 'Mine', kind: 'cost', amount: 100, date: '2026-01-05' })],
};

async function setup() {
  mounts.mockClear();
  lastError = null;
  const r = await renderWithRepo(<Harness />, seed);
  await waitFor(() => expect(state()).toContain('tx=Mine'));
  return r;
}
async function act2(fn: () => Promise<unknown>) {
  await act(async () => {
    try {
      await fn();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  });
}

describe('ProfileProvider', () => {
  it('starts on the first profile with its data', async () => {
    await setup();
    expect(state()).toContain('Me|onboarded=true|tx=Mine|buffer=777700');
  });

  it('a new profile is un-onboarded with default settings and no data; the first keeps its data', async () => {
    const { repo } = await setup();
    await act2(() => api.addProfile('Layla', 1));
    await waitFor(() => expect(state().startsWith('Layla|')).toBe(true));
    await waitFor(() => expect(state()).toContain('onboarded=false|tx=|'));
    expect(state()).not.toContain('buffer=777700');
    expect((await repo.getSettings()).onboarded).toBe(true);
    expect((await repo.listTransactions()).map((t) => t.id)).toEqual(['t1']);
  });

  it('remounts screens on switch and restores the first profile data when switching back', async () => {
    await setup();
    expect(mounts).toHaveBeenCalledTimes(1);
    await act2(() => api.addProfile('Layla', 1));
    await waitFor(() => expect(state().startsWith('Layla|')).toBe(true));
    expect(mounts).toHaveBeenCalledTimes(2);
    const first = api.profiles[0].id;
    await act2(() => api.switchProfile(first));
    await waitFor(() => expect(state()).toContain('Me|onboarded=true|tx=Mine|buffer=777700'));
    expect(mounts).toHaveBeenCalledTimes(3);
  });

  it('switching to the already active profile does not remount', async () => {
    await setup();
    await act2(() => api.switchProfile(api.active.id));
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('switching to an unknown profile fails with a message', async () => {
    await setup();
    await act2(() => api.switchProfile('nope'));
    expect(lastError).toMatch(/no longer exists/);
    expect(state().startsWith('Me|')).toBe(true);
  });

  it('deleting a non-active profile removes its data', async () => {
    const { store } = await setup();
    await act2(() => api.addProfile('Layla', 1));
    await waitFor(() => expect(state().startsWith('Layla|')).toBe(true));
    const layla = api.active.id;
    await act2(() => api.switchProfile(api.profiles[0].id));
    await waitFor(() => expect(state().startsWith('Me|')).toBe(true));
    await act2(() => api.deleteProfile(layla));
    expect(lastError).toBeNull();
    await waitFor(() => expect(api.profiles.map((p) => p.name)).toEqual(['Me']));
    expect(store.repositoryFor(layla)).toBeUndefined();
    expect((await store.init()).profiles).toHaveLength(1);
  });

  it('surfaces errors: deleting the active or the last profile', async () => {
    await setup();
    await act2(() => api.deleteProfile(api.active.id));
    expect(lastError).toBeTruthy();
    expect(api.profiles).toHaveLength(1);
    lastError = null;
    await act2(() => api.addProfile('Layla', 1));
    await waitFor(() => expect(state().startsWith('Layla|')).toBe(true));
    lastError = null;
    await act2(() => api.deleteProfile(api.active.id));
    expect(lastError).toBeTruthy();
    expect(api.profiles).toHaveLength(2);
  });

  it('surfaces errors: empty and too long names, and the 7th profile', async () => {
    await setup();
    await act2(() => api.addProfile('   ', 0));
    expect(lastError).toBe('Enter a name.');
    await act2(() => api.addProfile('x'.repeat(25), 0));
    expect(lastError).toMatch(/at most 24/);
    await act2(() => api.updateProfile(api.active.id, { name: '' }));
    expect(lastError).toBe('Enter a name.');
    expect(api.profiles).toHaveLength(1);
    for (let i = 1; i < MAX_PROFILES; i++) await act2(() => api.addProfile(`P${i}`, i));
    expect(api.profiles).toHaveLength(MAX_PROFILES);
    lastError = null;
    await act2(() => api.addProfile('Seventh', 0));
    expect(lastError).toBeTruthy();
    expect(api.profiles).toHaveLength(MAX_PROFILES);
  });

  it('a failed action does not block later ones', async () => {
    await setup();
    await act2(() => api.addProfile('', 0));
    await act2(() => api.addProfile('Ok', 0));
    await waitFor(() => expect(state().startsWith('Ok|')).toBe(true));
  });

  it('keeps the appearance when switching profiles', async () => {
    await setup();
    await act2(() => api.setAppearance('dark'));
    await act2(() => api.addProfile('Layla', 1));
    await waitFor(() => expect(state().startsWith('Layla|')).toBe(true));
    expect(api.appearance).toBe('dark');
  });
});

