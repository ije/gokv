import { createContext, createElement, PropsWithChildren } from "react";
import { GokvContextProps, GokvProviderProps } from "../../types/react.d.ts";
import { config } from "../../mod.ts";
import { getEnv } from "./utils.ts";

const defaultContext: GokvContextProps = {
  namespace: "default",
  imagesHost: getEnv("GOKV_ENV") === "development" ? "img.gokv.dev" : "img.gokv.io",
};

export const $context = createContext<GokvContextProps>(defaultContext);

export function GokvProvider({ children, signUrl, ...rest }: PropsWithChildren<GokvProviderProps>) {
  if (signUrl) {
    config({ signUrl });
  }
  const value: GokvContextProps = { ...defaultContext, ...rest };
  return createElement($context.Provider, { value }, children);
}

export type { GokvContextProps, GokvProviderProps };
