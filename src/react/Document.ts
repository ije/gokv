import type { FC, PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { RecordOrArray } from "../../types/common.d.ts";
import type { DocumentProviderProps } from "../../types/react.d.ts";
import { Document, snapshot, subscribe } from "../../mod.ts";
import { Context } from "./Context.ts";

export type DocumentContextProps = {
  doc?: Document<Record<string, unknown>>;
  online: boolean;
};

export const DocumentContext = createContext<DocumentContextProps>({
  online: false,
});

export const DocumentProvider: FC<PropsWithChildren<DocumentProviderProps>> = (props) => {
  const { namespace: parentNamespace } = useContext(Context);
  const namespace = props.namespace || parentNamespace;
  const doc = useMemo(() => new Document(props.id, { namespace }), [props.id, namespace]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const sync = async (retryTimes = 0) => {
      setLoading(true);
      try {
        await doc.sync({
          initialData: props.initialData,
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

  if (loading) {
    return props.fallback ?? null;
  }
  if (error) {
    throw error;
  }
  return createElement(DocumentContext.Provider, { value: { doc, online } }, props.children);
};

export const useDocumentStatus = (): { online: boolean } => {
  const { online } = useContext(DocumentContext);
  return { online };
};

export const useDocument = <T extends Record<string, unknown>>(): T => {
  const { doc } = useContext(DocumentContext);

  if (!doc) {
    throw new Error("No document found, please wrap your component with <DocumentProvider />.");
  }

  return doc.DOC as T;
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

export const useSnapshotValue = <T extends Record<string, unknown>, K extends keyof T>(obj: T, key: K): T[K] => {
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
