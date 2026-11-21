// Gives every screen the repository plus a "version" number that changes after
// each write, so screens re-read their data. Owned by the lead.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Repository } from '@/data/repository';

interface DataContextValue {
  repo: Repository;
  version: number;
  /** Call after a write so screens refresh. */
  bump: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ repo, version, bump }), [repo, version, bump]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

/**
 * Loads data with `load(repo)` and reloads it after every write.
 * Returns { data, loading, error, reload }.
 *
 *   const { data: items } = useRepoQuery((r) => r.listRecurring());
 */
export function useRepoQuery<T>(load: (repo: Repository) => Promise<T>, deps: unknown[] = []) {
  const { repo, version } = useData();
  const [nonce, setNonce] = useState(0);
  // `key` identifies one load; the result is "loading" until a result for the current key arrives.
  const key = [version, nonce, ...deps.map((d) => JSON.stringify(d))].join('|');
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: Error | null }>({
    key: null,
    data: undefined,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    load(repo).then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (error: Error) => !cancelled && setState({ key, data: undefined, error }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key]);
  // While reloading, keep showing the previous data (no flicker).
  return { data: state.data, error: state.error, loading: state.key !== key, reload: () => setNonce((n) => n + 1) };
}

/**
 * Wraps a write so the screens refresh after it.
 *
 *   const save = useRepoMutation((r, item: RecurringItem) => r.upsertRecurring(item));
 *   await save(item);
 */
export function useRepoMutation<A extends unknown[], R>(write: (repo: Repository, ...args: A) => Promise<R>) {
  const { repo, bump } = useData();
  return useCallback(
    async (...args: A) => {
      try {
        return await write(repo, ...args);
      } finally {
        bump(); // refresh even if the write failed part-way
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repo, bump],
  );
}

/** Loads everything the engine needs (settings, categories, recurring items, overrides, transactions). */
export function usePlanInput() {
  return useRepoQuery(async (r) => {
    const [settings, categories, recurring, overrides, transactions] = await Promise.all([
      r.getSettings(),
      r.listCategories(),
      r.listRecurring(),
      r.listOverrides(),
      r.listTransactions(),
    ]);
    return { settings, categories, recurring, overrides, transactions };
  });
}
