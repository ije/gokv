import { createElement, CSSProperties, PropsWithChildren, useContext, useMemo, useState } from "react";
import { ImageProps } from "../../types/react.d.ts";
import { FileStorage } from "../../mod.ts";
import { $context } from "./Context.ts";
import { atobUrl, btoaUrl, getImageThumbFromBlob, toPInt } from "./utils.ts";

export const useImageSrc = (props: Pick<ImageProps, "src" | "width" | "height" | "quality" | "fit">): {
  src?: string;
  srcSet?: string;
  aspectRatio?: number;
  blurPreview?: string;
  blurPreviewSize?: number;
  fit?: "contain" | "cover";
} => {
  const { src, width, height, quality, fit } = props;
  return useMemo(() => {
    const { imagesHost } = useContext($context);
    if (!src?.startsWith(`https://${imagesHost}/`)) {
      return { src };
    }
    const ret: ReturnType<typeof useImageSrc> = { src };
    const url = new URL(src);
    const parts = url.pathname.split("/");
    const imageId = parts[1];
    if (imageId.length >= 40) {
      const resizing: string[] = [];
      const w = toPInt(width);
      const h = toPInt(height);
      const q = toPInt(quality);
      if (w) resizing.push(`w=${w}`);
      if (h) resizing.push(`h=${h}`);
      if (q) resizing.push(`q=${q}`);
      if (w && h) {
        ret.fit = fit ?? "cover";
        resizing.push(`fit=${ret.fit}`);
      }
      if (w || h) {
        const pathname = "/" + imageId.slice(0, 40);
        ret.srcSet = [1, 2, 3]
          .map((r) => `https://${imagesHost}${pathname}/${resizing.join(",")},dpr=${r} ${r}x`)
          .join(", ");
      }
      if (imageId.length > 40) {
        const [w, h, ...rest] = imageId.slice(40).split("x");
        if (w && h) {
          ret.aspectRatio = parseInt(w, 32) / parseInt(h, 32);
        }
        if (rest.length > 0) {
          const v = rest.join("x");
          ret.blurPreviewSize = parseInt(v, 32);
          ret.blurPreview = `data:image/jpeg;base64,${atobUrl(v.slice(2))}`;
        }
      }
      ret.src = `https://${imagesHost}/${imageId.slice(0, 40)}/${resizing.join(",")}`;
    }
    return ret;
  }, [src, width, height, quality, fit]);
};

// The blur effect is copied from next.js/image
const blurSvg = (previewUrl: string, w: number, h: number): string => {
  return encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1'/><feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter><image preserveAspectRatio='none' filter='url(#b)' x='0' y='0' height='100%' width='100%' href='${previewUrl}'/></svg>`,
  );
};

export function Image(props: ImageProps) {
  const { alt, contentEditable, style } = props;
  const { namespace } = useContext($context);
  const fs = useMemo(() => new FileStorage({ namespace }), [namespace]);
  const { src, srcSet, aspectRatio, fit, blurPreview, blurPreviewSize } = useImageSrc(props);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const imgStyle = useMemo(() => ({
    ...(blurPreview && blurPreviewSize && aspectRatio
      ? {
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,${
          blurSvg(blurPreview, blurPreviewSize, blurPreviewSize / aspectRatio)
        }")`,
        backgroundSize: fit,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
      : null),
    objectFit: fit,
  }), [aspectRatio, blurPreview, blurPreviewSize, fit]);
  const $aspectRatio = useMemo(() => {
    return aspectRatio ?? style?.aspectRatio ?? (contentEditable && !previewUrl ? 1 : undefined);
  }, [aspectRatio, contentEditable, style?.aspectRatio, previewUrl]);

  const img = createElement("img", {
    ...props,
    src: previewUrl ?? src,
    key: previewUrl ?? src,
    srcSet: !previewUrl ? (props.srcSet ?? srcSet) : undefined,
    style: { ...style, ...imgStyle, aspectRatio: $aspectRatio },
    loading: props.loading ?? "lazy",
  });

  const upload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file.slice());
    setPreviewUrl(previewUrl);
    setIsUploading(true);
    setUploadProgress(0);
    try {
      let placeholder: string | undefined;
      const bp = props.blurPreview ?? "base";
      if (file.type === "image/jpeg") {
        const sizes = { "sm": 8, "base": 16, "md": 32, "lg": 64 };
        const size = sizes[bp] ?? 16;
        const thumb = await getImageThumbFromBlob(file.slice(), sizes[bp] ?? 16);
        placeholder = size.toString(32).padStart(2, "0") + btoaUrl(thumb.split(",")[1]);
      }
      const { url } = await fs.put(file, {
        onProgress: (loaded: number, total: number) => setUploadProgress(loaded / total),
      });
      props.onChange?.({ src: url + (placeholder ? `x${placeholder}` : ""), alt: file.name });
    } catch (error) {
      setError(error);
      console.error(error);
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setPreviewUrl(null);
        URL.revokeObjectURL(previewUrl);
      }, 0);
    }
  };

  if (!contentEditable) {
    return img;
  }

  return createElement(
    "div",
    { style: { position: "relative", display: "inline-flex" } },
    img,
    isUploading && uploadProgress === 0 && (
      createElement(Overlay, null, "Reading...")
    ),
    isUploading && uploadProgress > 0 && (
      createElement(Overlay, null, `${(uploadProgress * 100).toFixed(2)}%`)
    ),
    error && (
      createElement(
        Overlay,
        { style: { color: "red", backgroundColor: "rgba(255,0,0,0.1)" } },
        createElement("span", null, createElement("strong", null, "Error"), ": ", error.message),
      )
    ),
    !isUploading && createElement("input", {
      type: "file",
      accept: "image/*",
      style: {
        display: "inline-block",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        opacity: 0,
        cursor: "pointer",
      },
      title: alt ? `${alt} (Replace the image)` : "Select an image",
      onChange: (e) => {
        const file = e.target.files?.item(0);
        if (file) {
          upload(file);
        }
      },
    }),
  );
}

export function Overlay(props: PropsWithChildren<{ style?: CSSProperties }>) {
  return createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.5)",
      color: "white",
      ...props.style,
    },
  }, props.children);
}

export type { ImageProps };
