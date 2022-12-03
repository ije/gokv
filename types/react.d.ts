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
  fit?: "cover" | "contain";
  quality?: number;
  generateBlurPreview?: true | "xs" | "sm" | "base" | "md" | "lg";
  onChange?: (e: { src: string; alt: string }) => void;
}

export const useImageSrc: (
  props: Pick<ImageProps, "src" | "width" | "height" | "quality" | "fit">,
) => {
  src?: string;
  srcSet?: string;
  aspectRatio?: number;
  placeholder?: string;
};

export const Image: FC<ImageProps>;
