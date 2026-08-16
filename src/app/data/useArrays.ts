import { useEffect, useRef, useState } from 'react';

export type Loaded = { arrays: Float32Array[] | null; error: string | null };

type Settled = Loaded & { key: string };

const PENDING: Loaded = { arrays: null, error: null };

/**
 * Runs an async load whenever `key` changes and ignores a result that arrived
 * after the selection moved on.
 *
 * `key` rather than the loader itself is the dependency: the loader is a fresh
 * closure on every render, and depending on it would refetch forever. The
 * loaded key is kept beside the result so staleness is derived during render —
 * a result belonging to a key the user has already moved on from reads as
 * pending. Clearing it with a setState inside the effect would cost an extra
 * render pass and is what `react-hooks/set-state-in-effect` rejects.
 */
export function useArrays(key: string, load: () => Promise<Float32Array[]>): Loaded {
  const loader = useRef(load);
  const [settled, setSettled] = useState<Settled>({ key: '', ...PENDING });

  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    let live = true;

    loader
      .current()
      .then((arrays) => {
        if (live) setSettled({ key, arrays, error: null });
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setSettled({
          key,
          arrays: null,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      live = false;
    };
  }, [key]);

  return settled.key === key ? { arrays: settled.arrays, error: settled.error } : PENDING;
}
