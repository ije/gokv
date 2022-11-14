import { createElement, useContext, useMemo } from "react";
import { ImageProps } from "../../types/react.d.ts";
import { FileStorage } from "../../mod.ts";
import { toPInt } from "../common/utils.ts";
import { $context } from "./provider.ts";

function useSrcSet({ src, srcSet, width, height, quality, fit }: ImageProps): string | undefined {
  const { imagesHost } = useContext($context);
  if (!src?.startsWith(`https://${imagesHost}/`)) {
    return srcSet;
  }
  const url = new URL(src);
  const arr = url.pathname.split("/");
  const imageId = arr[1];
  if (imageId.length >= 40) {
    const resizing: string[] = [];
    const w = toPInt(width);
    const h = toPInt(height);
    const q = toPInt(quality);
    if (w) resizing.push(`w=${w}`);
    if (h) resizing.push(`h=${h}`);
    if (q) resizing.push(`q=${q}`);
    if (w && h && fit && ["cover", "contain"].includes(fit)) resizing.push(`fit=${fit}`);
    if (w || h) {
      const pathname = arr.join("/");
      srcSet = [1, 2, 3].map((r) => {
        return `https://${imagesHost}${pathname},dpr=${r}${url.search} ${r}x`;
      }).join(", ");
    }
  }
  return srcSet;
}

export function useFileStorage(): FileStorage {
  const { namespace } = useContext($context);
  return useMemo(() => new FileStorage({ namespace }), [namespace]);
}

export function Image(props: ImageProps) {
  const srcSet = useSrcSet(props);

  if (props.readonly) {
    if (!props.src) {
      return null;
    }
    return createElement("img", {
      ...props,
      srcSet,
      alt: props.alt ?? "",
      loading: props.loading ?? "lazy",
    });
  }
}
