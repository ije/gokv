import type { FC, PropsWithChildren } from "react";
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { RecordOrArray } from "../../types/common.d.ts";
import type { DocumentProviderProps } from "../../types/react.d.ts";
import { Document, ProxyProvider, snapshot, subscribe } from "../../mod.ts";
import { Context } from "./Context.ts";
import { ConnectStateContext, ConnectStateProvider } from "./ConnectState.ts";

export type DocumentContextProps = {
  doc?: RecordOrArray;
};

export const DocumentContext = createContext<DocumentContextProps>({});

const DocumentConnect: FC<PropsWithChildren<DocumentProviderProps>> = (props) => {
  const ctx = useContext(Context);
  const { setState: setConnState } = useContext(ConnectStateContext);
  const namespace = props.namespace || ctx.namespace;
  const region = props.region || ctx.region;
  const [doc, proxyProvider] = useMemo(() => [
    new Document(props.id, { namespace, region }),
    new ProxyProvider<RecordOrArray>(),
  ], [props.id, namespace, region]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const value: Required<DocumentContextProps> = useMemo(() => ({ doc: proxyProvider.object }), [doc]);

  useEffect(() => {
    const ac = new AbortController();
    const sync = async (retryTimes = 0) => {
      setLoading(true);
      try {
        await doc.sync({
          proxyProvider: proxyProvider,
          signal: ac.signal,
          initial: props.initial,
          onStateChange: setConnState,
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
  return createElement(DocumentContext.Provider, { value }, props.children);
};

export const DocumentProvider: FC<PropsWithChildren<DocumentProviderProps>> = (props) => {
  return createElement(ConnectStateProvider, null, createElement(DocumentConnect, props));
};

export const useDocument = <T extends RecordOrArray>(): T => {
  const { doc } = useContext(DocumentContext);

  if (!doc) {
    throw new Error("No document found, please wrap your component within <DocumentProvider />.");
  }

  return doc as T;
};

export function useSnapshot<T extends RecordOrArray>(obj: T): T;
export function useSnapshot<T extends RecordOrArray, K extends keyof T>(obj: T, key: K): T[K];
export function useSnapshot<T extends RecordOrArray, K extends keyof T>(obj: T, key?: K): T | T[K] {
  const getSnap = () => {
    if (key === undefined) {
      return snapshot(obj);
    }
    const val = obj[key];
    if (typeof val === "object" && val !== null) {
      return snapshot(val as RecordOrArray) as T[K];
    }
    return val;
  };
  const [value, setValue] = useState(getSnap);

  useEffect(() => {
    const update = () => setValue(getSnap());
    update();
    return key === undefined ? subscribe(obj, update) : subscribe(obj, key as string, update);
  }, [obj, key]);

  return value;
}
