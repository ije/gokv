import { useContext, useEffect, useMemo, useState } from "react";
import type { RecordOrArray } from "../../types/common.d.ts";
import { Document, snapshot, subscribe } from "../../mod.ts";
import { $context } from "./Context.ts";

export const useDocument = <T extends Record<string, unknown>>(docId: string) => {
  const { namespace } = useContext($context);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const doc = useMemo(() => new Document<T>(docId, { namespace }), [docId, namespace]);

  // should support `suspense` mode?

  useEffect(() => {
    const ac = new AbortController();
    const sync = async (retryTimes = 0) => {
      setLoading(true);
      try {
        await doc.sync({
          signal: ac.signal,
          onOnline: () => setOnline(true),
          onOffline: () => setOnline(false),
        });
        setLoading(false);
      } catch (err) {
        if (err.message !== "aborted" && retryTimes < 3) {
          const delay = (retryTimes + 1) * 100;
          setTimeout(() => sync(retryTimes + 1), delay);
          console.warn(`[gokv] fail to sync document(${doc.id}), retry after ${delay}ms ...`);
        } else {
          setError(err);
          setLoading(false);
        }
      }
    };
    sync();
    return () => ac.abort();
  }, [doc]);

  return { doc: doc.DOC, error, loading, online };
};

export const useSnapshot = <T extends RecordOrArray>(obj: T): T => {
  const [snap, setSnap] = useState(() => snapshot(obj));

  useEffect(() => {
    return subscribe(obj, () => {
      setSnap(snapshot(obj));
    });
  }, [obj]);

  return snap;
};

export const useValue = <T extends Record<string, unknown>, K extends keyof T>(obj: T, key: K): T[K] => {
  const [value, setValue] = useState(() => {
    const val = obj[key];
    if (typeof val === "object" && val !== null) {
      return snapshot(val as RecordOrArray) as T[K];
    }
    return val;
  });

  useEffect(() => {
    return subscribe(obj, key as string, () => {
      const val = obj[key];
      if (typeof val === "object" && val !== null) {
        setValue(snapshot(val as RecordOrArray) as T[K]);
      } else {
        setValue(val);
      }
    });
  }, [obj, key]);

  return value;
};
