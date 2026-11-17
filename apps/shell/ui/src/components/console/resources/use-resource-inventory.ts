'use client';

import { useCallback, useEffect, useState } from 'react';
import { ResourceReadError } from './resource-client';

type ReadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string; unsupported: boolean };

export function useResourceInventory<T>(load: (signal?: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadState<T>>({ status: 'loading' });
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void load(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: 'ready', data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', error: error instanceof Error ? error.message : String(error),
        unsupported: error instanceof ResourceReadError && error.unsupported });
    });
    return () => controller.abort();
  }, [load, attempt]);
  return { state, refresh };
}
