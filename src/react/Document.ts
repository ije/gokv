import { useContext, useEffect, useMemo, useState } from "react";
import { Document, snapshot, subscribe } from "../../mod.ts";
import { $context } from "./Context.ts";

export const useDocument = <T extends Record<string, unknown>>(docId: string) => {
  const { namespace } = useContext($context);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const doc = useMemo(() => new Document<T>(docId, { namespace }), [docId, namespace]);

  // should support suspense mode?

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
      } catch (err) {
        if (err.message !== "aborted" && retryTimes < 3) {
          // retry after 0.1s, 0.2s, 0.3s
          setTimeout(() => sync(retryTimes + 1), (retryTimes + 1) * 100);
          return;
        }
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    setLoading(true);
    sync();
    return ac.abort();
  }, [doc]);

  return { doc: doc.docObject, error, loading, online };
};

export const useSnapshot = <T extends Record<string, unknown> | Array<unknown>>(obj: T): T => {
  const [snap, setSnap] = useState(() => snapshot(obj));

  useEffect(() => {
    return subscribe(obj, () => {
      setSnap(snapshot(obj));
    });
  }, [obj]);

  return snap;
};
