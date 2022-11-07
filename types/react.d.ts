import type { CSSProperties, FC, PropsWithChildren } from "react";

export type GokvProviderProps = {
  namespace?: string;
  signUrl?: string;
};

export const GokvProvider: FC<PropsWithChildren<GokvProviderProps>>;

export interface ImageProps {
  readonly?: boolean;
  url?: string;
  alt?: string;
  onChange: (url: string) => void;
  className?: string;
  style?: CSSProperties;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  fit?: "cover" | "contain";
}

export const Image: FC<ImageProps>;
