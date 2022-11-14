import { createContext, createElement, PropsWithChildren } from "react";
import { GokvContextProps, GokvProviderProps } from "../../types/react.d.ts";
import { config } from "../../mod.ts";

const defaultGokvProps: GokvContextProps = {
  namespace: "default",
  imagesHost: "img.gokv.io",
};

export const $context = createContext<GokvContextProps>(defaultGokvProps);

export function GokvProvider({ children, signUrl, ...rest }: PropsWithChildren<GokvProviderProps>) {
  if (signUrl) {
    config({ signUrl });
  }
  const value = { ...defaultGokvProps };
  for (const [key, val] of Object.entries(rest)) {
    if (val !== undefined) {
      value[key as unknown as keyof GokvContextProps] = val;
    }
  }
  return createElement($context.Provider, { value }, children);
}
