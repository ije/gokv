import { createContext, createElement, PropsWithChildren } from "react";
import { GokvProviderProps } from "../../types/react.d.ts";

export const $context = createContext<GokvProviderProps>({
  namespace: "default",
  signUrl: "/sign-access-token",
});

export function GokvProvider({ children, ...rest }: PropsWithChildren<GokvProviderProps>) {
  return createElement($context.Provider, { value: rest }, children);
}
