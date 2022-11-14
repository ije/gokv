/// <reference lib="dom" />

import type { FC, FormEventHandler, ImgHTMLAttributes, PropsWithChildren } from "react";

export type GokvContextProps = {
  namespace: string;
  imagesHost: string;
};

export type GokvProviderProps = {
  signUrl?: string;
} & Partial<GokvContextProps>;

export const GokvProvider: FC<PropsWithChildren<GokvProviderProps>>;

export interface ImageProps extends ImgHTMLAttributes<HTMLImageElement & { averageColor: string }> {
  readonly?: boolean;
  fit?: "cover" | "contain" | "fill";
  quality?: number;
  onChange?:
    | FormEventHandler<{ src: string; alt: string; width: number; height: number; averageColor: string }>
    | undefined;
}

export const Image: FC<ImageProps>;
