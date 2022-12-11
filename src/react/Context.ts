import { createContext, createElement, PropsWithChildren } from "react";
import type { GokvContextProps, GokvProviderProps } from "../../types/react.d.ts";
import { config } from "../../mod.ts";
import { getEnv } from "./utils.ts";

const defaultContext: GokvContextProps = {
  namespace: "default",
  imagesHost: getEnv("GOKV_ENV") === "development" ? "img.gokv.dev" : "img.gokv.io",
};

export const Context = createContext<GokvContextProps>(defaultContext);

export function GokvProvider({ children, tokenSignUrl, tokenMaxAge, ...rest }: PropsWithChildren<GokvProviderProps>) {
  config({ tokenSignUrl, tokenMaxAge });
  const value: GokvContextProps = { ...defaultContext, ...rest };
  return createElement(Context.Provider, { value }, children);
}

export type { GokvContextProps, GokvProviderProps };
