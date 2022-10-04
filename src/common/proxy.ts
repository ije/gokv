import type { JSONPatch, Path } from "./JSON-patch.ts";

export default function proxy<T extends Record<string, unknown>>(
  initialObject: T,
  notify: (patch: JSONPatch) => void,
  path: Path = [],
): T {
  if (typeof initialObject !== "object" || initialObject === null) {
    throw new Error("can't proxy non-object");
  }
  const isArray = Array.isArray(initialObject);
  const fixProp = (prop: string | symbol) =>
    isArray && typeof prop === "string" && prop.charCodeAt(0) <= 57 ? Number(prop) : prop;
  const src = isArray ? [] : Object.create(Object.getPrototypeOf(initialObject));
  let notifyFn: typeof notify | null = null;
  const proxyObject = new Proxy(src, {
    get: (target: T, prop: string | symbol, receiver: unknown): unknown => {
      return Reflect.get(target, prop, receiver);
    },
    set: (target: T, prop: string | symbol, value: unknown, receiver: unknown): boolean => {
      const key = fixProp(prop);
      const op = Reflect.has(target, prop) ? "replace" : "add";
      const oldValue = Reflect.get(target, prop, receiver);
      const canProxy = typeof value === "object" && value !== null && typeof key !== "symbol";
      const updated = Reflect.set(
        target,
        prop,
        canProxy ? proxy(value as T, notify, [...path, key]) : value,
        receiver,
      );
      if (updated && typeof key !== "symbol" && !(isArray && key === "length")) {
        notifyFn?.({
          op,
          path: [...path, key],
          value,
          oldValue,
        });
      }
      return updated;
    },
    deleteProperty: (target: T, prop: string | symbol): boolean => {
      const key = fixProp(prop);
      const oldValue = Reflect.get(target, prop);
      const deleted = Reflect.deleteProperty(target, prop);
      if (deleted && typeof key !== "symbol") {
        notifyFn?.({
          op: "remove",
          path: [...path, key],
          oldValue,
        });
      }
      return deleted;
    },
  });
  Reflect.ownKeys(initialObject).forEach((key) => {
    const desc = Object.getOwnPropertyDescriptor(initialObject, key);
    if (desc?.get || desc?.set) {
      Object.defineProperty(src, key, desc);
    } else {
      proxyObject[key] = initialObject[key as keyof T];
    }
  });
  notifyFn = notify;
  return proxyObject;
}
