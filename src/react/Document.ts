import { useContext, useEffect, useMemo, useState } from "react";
import { Document, snapshot, subscribe } from "../../mod.ts";
import { $context } from "./Context.ts";

export const useSnapshot = <T extends Record<string, unknown> | Array<unknown>>(obj: T): T => {
  const [snap, setSnap] = useState(() => snapshot(obj));

  useEffect(() => {
    return subscribe(obj, () => {
      setSnap(snapshot(obj));
    });
  }, [obj]);

  return snap;
};

export const useDocument = <T extends Record<string, unknown>>(docId: string) => {
  const { namespace } = useContext($context);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const doc = useMemo(() => new Document<T>(docId, { namespace }), [docId, namespace]);

  // todo: support suspense mode

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    // todo: retry 3 times if failed
    doc.sync({ signal: ac.signal })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
    return () => {
      ac.abort();
    };
  }, [doc]);

  return { doc: doc.docObject, error, loading };
};
