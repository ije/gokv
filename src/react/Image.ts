import {
  createElement,
  CSSProperties,
  PropsWithChildren,
  SyntheticEvent,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ImageProps } from "../../types/react.d.ts";
import { FileStorage } from "../../mod.ts";
import { $context } from "./Context.ts";
import { atobUrl, btoaUrl, getThumbImageFromBlob, toPInt } from "./utils.ts";

export const useImageSrc = (
  props: Pick<ImageProps, "src" | "width" | "height" | "quality" | "fit">,
): {
  src?: string;
  srcSet?: string;
  aspectRatio?: number;
  placeholder?: string;
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
      if (w && h) resizing.push(`fit=${fit ?? "cover"}`);
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
          const placeholder = rest.join("x");
          ret.placeholder = `data:image/jpeg;base64,${atobUrl(placeholder)}`;
        }
      }
      ret.src = `https://${imagesHost}/${imageId.slice(0, 40)}${parts[2] ? `/${parts[2]}` : ""}`;
    }
    return ret;
  }, [src, width, height, quality, fit]);
};

// the blur effect is copied from next.js/image
const blurSvg = (previewUrl: string, aspectRatio: number): string => {
  const h = 16 / aspectRatio;
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 ${h}'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1'/><feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter><image preserveAspectRatio='none' filter='url(#b)' x='0' y='0' height='100%' width='100%' href='${previewUrl}'/></svg>`;
};

export function Image(props: ImageProps) {
  const { namespace } = useContext($context);
  const fs = useMemo(() => new FileStorage({ namespace }), [namespace]);
  const { src, srcSet, aspectRatio, placeholder } = useImageSrc(props);
  const [isLoading, setIsLoading] = useState(() => Boolean(src));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const Imagestyle = useMemo(() => ({
    ...(placeholder && aspectRatio
      ? {
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,${
          encodeURIComponent(blurSvg(placeholder, aspectRatio))
        }")`,
        backgroundSize: props.fit ?? "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
      : null),
    objectFit: props.fit ?? "cover",
    aspectRatio: props.style?.aspectRatio ?? aspectRatio,
  }), [aspectRatio, placeholder, isLoading, props.style?.aspectRatio, props.fit]);

  const img = createElement("img", {
    ...props,
    src: previewUrl ?? src,
    srcSet: !previewUrl ? props.srcSet ?? srcSet : undefined,
    style: { ...props.style, ...Imagestyle },
    loading: props.loading ?? "lazy",
    onLoad: (e: SyntheticEvent<HTMLImageElement>) => {
      setIsLoading(false);
      props.onLoad?.(e);
    },
  });

  useEffect(() => {
    if (src) {
      setIsLoading(true);
    }
  }, [src]);

  if (props.readonly) {
    return img;
  }

  return createElement(
    "div",
    { style: { position: "relative", display: "inline-block" } },
    img,
    isUploading && uploadProgress === 0 && (
      createElement(Box, null, "Reading...")
    ),
    isUploading && uploadProgress > 0 && (
      createElement(Box, null, `${(uploadProgress * 100).toFixed(2)}%`)
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
      title: props.alt ? `${props.alt} (Replace the image)` : "Select an image",
      onChange: async (e) => {
        const file = e.target.files?.item(0);
        if (file) {
          const previewUrl = URL.createObjectURL(file.slice());
          let placeholder: string | undefined;
          setPreviewUrl(previewUrl);
          setIsUploading(true);
          setUploadProgress(0);
          const gen = props.generateBlurPreview;
          if (gen) {
            const sizes = { "xs": 4, "sm": 8, "base": 16, "md": 32, "lg": 64 };
            const thumb = await getThumbImageFromBlob(file.slice(), sizes[gen === true ? "base" : gen] ?? 16);
            placeholder = btoaUrl(thumb.split(",")[1]);
          }
          const { url } = await fs.put(file, {
            onProgress: (loaded: number, total: number) => setUploadProgress(loaded / total),
          });
          setIsUploading(false);
          props.onChange?.({ src: url + (placeholder ? `x${placeholder}` : ""), alt: file.name });
          setTimeout(() => {
            setPreviewUrl(null);
            URL.revokeObjectURL(previewUrl);
          }, 0);
        }
      },
    }),
  );
}

export function Box(props: PropsWithChildren<{ style?: CSSProperties }>) {
  return createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
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
