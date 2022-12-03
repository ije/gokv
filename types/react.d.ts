/// <reference lib="dom" />

import type { FC, ImgHTMLAttributes, PropsWithChildren } from "react";

export type GokvContextProps = {
  namespace: string;
  imagesHost: string;
};

export type GokvProviderProps = {
  signUrl?: string;
} & Partial<GokvContextProps>;

export const GokvProvider: FC<PropsWithChildren<GokvProviderProps>>;

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onChange"> {
  readonly?: boolean;
  fit?: "cover" | "contain" | "fill";
  quality?: number;
  generatePlaceholder?: boolean | "color" | "blur" | "blur-sm" | "blur-md" | "blur-lg";
  onChange?: (e: { src: string; alt: string }) => void;
}

export const useImageSrcSet: (
  props: Pick<ImageProps, "src" | "srcSet" | "width" | "height" | "quality" | "fit">,
) => string | undefined;

export const Image: FC<ImageProps>;
