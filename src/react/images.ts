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
import { $context } from "./provider.ts";
import { atobUrl, btoaUrl, getAverageRGBFromBlob, getThumbImageFromBlob, rgbToHex, toPInt } from "./utils.ts";

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
      if (w && h && fit && ["cover", "contain"].includes(fit)) resizing.push(`fit=${fit}`);
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
          const flag = placeholder.charAt(0);
          if (flag === "c") {
            ret.placeholder = `#${placeholder.slice(1)}`;
          } else if (flag === "i") {
            ret.placeholder = `data:image/png;base64,${atobUrl(placeholder.slice(1))}`;
          }
        }
      }
      ret.src = `https://${imagesHost}/${imageId.slice(0, 40)}${parts[2] ? `/${parts[2]}` : ""}`;
    }
    return ret;
  }, [src, width, height, quality, fit]);
};

export function Image(props: ImageProps) {
  const { namespace } = useContext($context);
  const fs = useMemo(() => new FileStorage({ namespace }), [namespace]);
  const { src, srcSet, aspectRatio, placeholder } = useImageSrc(props);
  const [isLoading, setIsLoading] = useState(() => Boolean(src));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const style = useMemo(() => ({
    ...props.style,
    ...(isLoading && placeholder?.startsWith("#") ? { backgroundColor: placeholder } : null),
    ...(isLoading && placeholder?.startsWith("data:image/") ? { backgroundImage: `url(${placeholder})` } : null),
    aspectRatio: props.style?.aspectRatio ?? aspectRatio,
  }), [props.style, aspectRatio, placeholder, isLoading]);

  const img = createElement("img", {
    ...props,
    src: imagePreview ?? src,
    srcSet: props.srcSet ?? srcSet,
    style,
    loading: props.loading ?? "lazy",
    onLoad: (e: SyntheticEvent<HTMLImageElement>) => {
      setIsLoading(false);
      !e.currentTarget.src.startsWith("blob:") && setImagePreview((previewUrl) => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        return null;
      });
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
          const gp = props.generatePlaceholder;
          const previewUrl = URL.createObjectURL(file.slice());
          let placeholder: string | undefined;
          setImagePreview(previewUrl);
          setIsUploading(true);
          setUploadProgress(0);
          if (gp !== false) {
            if (gp === "color" || gp === true || gp === undefined) {
              const color = await getAverageRGBFromBlob(file.slice());
              placeholder = `c${rgbToHex(color)}`;
            } else if (gp.startsWith("blur")) {
              const sizes = {
                "blur": 16,
                "blur-sm": 8,
                "blur-md": 32,
                "blur-lg": 64,
              };
              const thumb = await getThumbImageFromBlob(file.slice(), sizes[gp]);
              placeholder = `i${btoaUrl(thumb)}`;
            }
          }
          console.log(placeholder);
          const { url } = await fs.put(file, {
            onProgress: (loaded: number, total: number) => setUploadProgress(loaded / total),
          });
          setIsUploading(false);
          console.log(url + (placeholder ? `x${placeholder}` : ""));
          props.onChange?.({ src: url + (placeholder ? `x${placeholder}` : ""), alt: file.name });
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
